"""
실제 어떤 식으로 돌아가는지에 대한 테스트 코드입니당! 참고하라고 만들어 뒀어요
만들어진 분당 session 데이터는 나쁜자세 누적 점수라서 리포트에 표시할 때는 100점에서 빼거나 점수가 100을 넘으면 그냥 0점으로 표시하는 방식으로 하면 될거 같아용
아마 100점을 넘기지는 않을거라고 생각하긴 합니다만... 어쨌든 로직상 만들어 놓기는 해야할거 같아서ㅎ
eg) 2026-05-01 23:38,33.11 -> 표시할 때는 67점 | 2026-05-01 23:34,112 -> 표시할 때는 0점 | 2026-05-01 23:38, 1.2 -> 표시할 때는 99점 이런식으로 표기하면 될거 같아요

주석 달아놨으니 참고하세용
"""

import cv2
import time
import os
import csv
import datetime
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

# 분리된 모듈 임포트
from utils import OneEuroFilter, get_hand_near_shoulder, calculate_posture_metrics
from cv_engine import PostureEngine

# 모델 경로 설정
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
POSE_MODEL = os.path.join(BASE_DIR, "models", "pose_landmarker_full.task")
FACE_MODEL = os.path.join(BASE_DIR, "models", "face_landmarker.task")

def main():
    # 1. 엔진 및 필터 초기화
    engine = PostureEngine()
    oef = OneEuroFilter()
    
    # 2. 카메라 설정
    cap = cv2.VideoCapture(0)
    
    # 3. MediaPipe 옵션 설정
    pose_opt = mp_vision.PoseLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=POSE_MODEL),
        running_mode=mp_vision.RunningMode.VIDEO, num_poses=1)
    face_opt = mp_vision.FaceLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=FACE_MODEL),
        running_mode=mp_vision.RunningMode.VIDEO, num_faces=1)

    # 테스트용 상태 변수
    calib_bl = None
    calib_phase = None
    calib_start = 0
    calib_buf = []

    print("=== Geobugi CV Test Runner ===")
    print("C: 캘리브레이션 시작 | Q: 종료")

    with (mp_vision.PoseLandmarker.create_from_options(pose_opt) as plm,
          mp_vision.FaceLandmarker.create_from_options(face_opt) as flm):
        
        while cap.isOpened():
            ret, frame = cap.read()
            if not ret: break
            frame = cv2.flip(frame, 1)
            h, w = frame.shape[:2]
            now_t = time.time()
            
            # AI 분석용 이미지 변환
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
            
            p_res = plm.detect_for_video(mp_img, int(now_t * 1000))
            f_res = flm.detect_for_video(mp_img, int(now_t * 1000))

            paused = True
            sh_angle = 0.0
            current_pos_pct = 0.0
            current_score = 0.0

            # 랜드마크 감지 성공 시
            if p_res.pose_landmarks and f_res.face_landmarks:
                plms, flms = p_res.pose_landmarks[0], f_res.face_landmarks[0]
                
                # 어깨 가려짐 체크
                if not get_hand_near_shoulder(plms):
                    metrics = calculate_posture_metrics(flms, plms)
                    if metrics:
                        paused = False
                        f_norm = oef(metrics["face_norm"], now_t)
                        sh_angle = metrics["sh_angle"]
                        
                        # [캘리브레이션 모드]
                        if calib_phase == 'running':
                            calib_buf.append(f_norm)
                            if now_t - calib_start >= 5.0:
                                calib_bl = sum(calib_buf) / len(calib_buf)
                                calib_phase = 'done'
                                print(f"Calibration Done! Baseline: {calib_bl:.4f}")
                        
                        # [실시간 추정 모드]
                        if calib_bl:
                            current_pos_pct = max(0.0, (f_norm - calib_bl) / calib_bl)
                            current_score = (current_pos_pct * 100) + abs(sh_angle)
                            
                            # 엔진 업데이트 (내부적으로 1분마다 db_session_history에 누적)
                            is_minute_passed = engine.process_frame_data(current_score, paused)
                            if is_minute_passed:
                                print(f"1분 경과: 대표값 {engine.db_session_history[-1]['rep_value']} 저장됨")

            # ── UI 시각화 (테스트용) ──
            # 상단 배경 박스
            cv2.rectangle(frame, (0, 0), (w, 80), (30, 30, 30), -1)
            
            if calib_bl:
                # 목 단계 및 누적 점수 표시
                cv2.putText(frame, f"Neck Stage: {engine.neck_stage} / 10", (20, 30), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
                cv2.putText(frame, f"Cumulative: {engine.cumulative_score:.1f} | Cur: {current_score:.1f}", (20, 60), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 255, 255), 1)
                
                # 1분 타이머 진행도 시각화
                elapsed = now_t - engine.minute_start_time
                bar_w = int((elapsed / 60.0) * 200)
                cv2.rectangle(frame, (w-220, 30), (w-20, 45), (50, 50, 50), -1)
                cv2.rectangle(frame, (w-220, 30), (w-220 + bar_w, 45), (0, 255, 0), -1)
            else:
                cv2.putText(frame, "Press 'C' to Start Calibration", (w//2-150, h//2), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 150, 255), 2)

            # 민감도 표시
            cv2.putText(frame, f"Sens: {engine.sensitivity}", (w-120, 70), 
                        cv2.FONT_HERSHEY_SIMPLEX, 0.5, (150, 150, 150), 1)

            if calib_phase == 'running':
                cv2.putText(frame, f"CALIBRATING... {5 - int(now_t - calib_start)}s", (w//2-120, 50), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)

            if paused and calib_bl:
                cv2.putText(frame, "PAUSED", (w//2-50, h//2), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 0, 255), 2)

            cv2.imshow("Geobugi CV Test Runner", frame)
            
            # 키 입력 처리
            key = cv2.waitKey(1) & 0xFF
            if key == ord('q'): 
                break
            elif key == ord('c'):
                calib_phase, calib_start, calib_buf = 'running', time.time(), []

    # ── 종료 시 세션 결과 저장 및 출력 ──
    cap.release()
    cv2.destroyAllWindows()

    if engine.db_session_history:
        print("\n=== 세션 종료: DB 저장 데이터 리스트 ===")
        log_fn = f"test_session_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
        
        with open(log_fn, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerow(["timestamp", "rep_value"])
            for record in engine.db_session_history:
                print(f"[{record['timestamp']}] 대표값: {record['rep_value']}")
                writer.writerow([record['timestamp'], record['rep_value']])
        
        print(f"\n테스트 세션 데이터가 '{log_fn}'에 저장되었습니다.")
    else:
        print("\n저장된 데이터가 없습니다. (1분 미만 실행)")

if __name__ == "__main__":
    main()
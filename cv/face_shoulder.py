#이 파일은 분리된 로직의 base 코드입니당 cv_test, cv_main의 코드 참고해서 코드 구현하시면 될거 같아유

import datetime, math, os, time, csv
import cv2
import numpy as np
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

# ── 모델 파일 경로 설정 ───────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
POSE_MODEL_PATH = os.path.join(BASE_DIR, "models", "pose_landmarker_full.task")
FACE_MODEL_PATH = os.path.join(BASE_DIR, "models", "face_landmarker.task")

if not os.path.exists(POSE_MODEL_PATH) or not os.path.exists(FACE_MODEL_PATH):
    print("모델 파일을 찾을 수 없습니다. models 폴더를 확인해주세요.")
    exit()

# ── 상수 ──────────────────────────────────────────────────────────────────
POSE_L_SH, POSE_R_SH = 11, 12
FACE_SKIP = 2
CALIB_SEC = 5.0
SAMPLE_INTERVAL = 1.0  
REP_WINDOW_SEC = 60.0  

# ── 필터 및 계산 함수 ──────────────────────────────────────────────────────
class OneEuroFilter:
    def __init__(self, min_cutoff=0.1, beta=0.007, d_cutoff=1.0):
        self.min_cutoff = min_cutoff; self.beta = beta; self.d_cutoff = d_cutoff
        self._x = self._dx = self._t = None
    def _alpha(self, cutoff, freq):
        tau = 1.0 / (2.0 * math.pi * cutoff)
        return 1.0 / (1.0 + tau * freq)
    def __call__(self, x, t):
        if self._x is None: self._x = x; self._t = t; self._dx = 0.0; return x
        freq = 1.0 / max(t - self._t, 1e-6); self._t = t
        dx = (x - self._x) * freq
        a_d = self._alpha(self.d_cutoff, freq)
        self._dx = a_d * dx + (1 - a_d) * self._dx
        cutoff = self.min_cutoff + self.beta * abs(self._dx)
        a = self._alpha(cutoff, freq)
        self._x = a * x + (1 - a) * self._x
        return self._x

def hand_near_shoulder(plms):
    l_sh, r_sh = plms[POSE_L_SH], plms[POSE_R_SH]
    l_wr, r_wr = plms[15], plms[16]
    d = 0.18
    return any(math.dist((w.x, w.y), (s.x, s.y)) < d for w in [l_wr, r_wr] for s in [l_sh, r_sh])

def calc_metrics(flms, plms):
    l_sh, r_sh = plms[POSE_L_SH], plms[POSE_R_SH]
    sw = abs(l_sh.x - r_sh.x)
    if sw < 0.01: return None
    xs, ys = [lm.x for lm in flms], [lm.y for lm in flms]
    face_area = (max(xs) - min(xs)) * (max(ys) - min(ys))
    face_norm = face_area / (sw ** 2)
    angle = math.degrees(math.atan2(l_sh.y - r_sh.y, l_sh.x - r_sh.x))
    return {"face_norm": face_norm, "sh_angle": angle}

# ── 시각화 함수 ───────────────────────────────────────────────────────────
def draw_overlay(frame, pos, sh_angle, all_calib_done, calib_phase, calib_countdown, samples, 
                 last_rep_value, minute_elapsed, sensitivity, cumulative_score, neck_stage):
    h, w = frame.shape[:2]
    x0 = w - 420
    overlay = frame.copy()
    cv2.rectangle(overlay, (x0-10, 0), (w, 320), (20,20,20), -1) # 높이 약간 조절
    cv2.addWeighted(overlay, 0.65, frame, 0.35, 0, frame)

    if all_calib_done:
        current_score = (pos * 100) + abs(sh_angle)
        
        cv2.putText(frame, f"CUR SCORE: {current_score:.1f}", (x0, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 0) if current_score <= sensitivity else (0, 0, 255), 2)
        
        cv2.putText(frame, f"1min REP: {last_rep_value:.1f} (Sens: {sensitivity})", (x0, 70), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 1)
        
        cv2.line(frame, (x0, 85), (w-20, 85), (80,80,80), 1)
        score_col = (0, 165, 255) if cumulative_score > 0 else (150, 150, 150)
        cv2.putText(frame, f"CUMULATIVE: {cumulative_score:.1f} / 100", (x0, 110), cv2.FONT_HERSHEY_SIMPLEX, 0.7, score_col, 2)
        
        stage_col = (0, 0, 255) if neck_stage > 5 else (255, 255, 255)
        cv2.putText(frame, f"TURTLE STAGE: {neck_stage} / 10", (x0, 145), cv2.FONT_HERSHEY_SIMPLEX, 0.8, stage_col, 2)
        
        cv2.rectangle(frame, (x0, 160), (w-20, 170), (50, 50, 50), -1)
        progress_w = int((minute_elapsed / REP_WINDOW_SEC) * (w - 20 - x0))
        cv2.rectangle(frame, (x0, 160), (x0 + progress_w, 170), (255, 200, 0), -1)
    else:
        cv2.putText(frame, "PRESS 'C' TO CALIBRATE", (x0, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 150, 255), 2)

    cv2.putText(frame, f"Shoulder Angle: {sh_angle:+.1f} deg", (x0, 200), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (200, 200, 200), 1)
    if calib_phase:
        cv2.rectangle(frame, (x0, 220), (w-20, 270), (0, 100, 100), -1)
        cv2.putText(frame, f"CALIBRATING: {calib_countdown:.1f}s", (x0+10, 255), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 255), 2)
    
    cv2.putText(frame, "C:Calib  Up/Down:Sens  Q:Quit", (10, h-15), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (120,120,120), 1)

# ── 메인 ─────────────────────────────────────────────────────────────────
def main():
    pose_opt = mp_vision.PoseLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=POSE_MODEL_PATH),
        running_mode=mp_vision.RunningMode.VIDEO, num_poses=1)
    face_opt = mp_vision.FaceLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=FACE_MODEL_PATH),
        running_mode=mp_vision.RunningMode.VIDEO, num_faces=1)

    cap = cv2.VideoCapture(0)
    oef = OneEuroFilter(0.1, 0.007)
    
    # 로그 파일
    log_filename = f"posture_rep_log_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    csv_file = open(log_filename, mode='w', newline='', encoding='utf-8')
    csv_writer = csv.writer(csv_file)
    csv_writer.writerow(["timestamp", "rep_value"])

    calib_done, calib_buf, calib_bl = {"good": False}, {"good": []}, {"good": None}
    calib_phase, calib_start, all_calib_done = None, 0.0, False
    cached_flms = None; last_val_f = 0.0; last_pos = 0.0; last_sh_angle = 0.0
    
    # ── 캐릭터 제어 로직 변수 ──
    sensitivity = 10.0      # 민감도 (사용자 조정 가능! 옵션에서 조정 가능하게 할 예정)
    cumulative_score = 0.0  # 누적 점수 (0~100)
    neck_stage = 1          # 목 단계 (1~10)
    
    minute_samples = []
    minute_start_time = time.time()
    last_sample_time = time.time()
    last_rep_value = 0.0
    
    frame_idx, start_time = 0, time.time()

    with (mp_vision.PoseLandmarker.create_from_options(pose_opt) as plm,
          mp_vision.FaceLandmarker.create_from_options(face_opt) as flm):

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret: break
            frame = cv2.flip(frame, 1); h, w = frame.shape[:2]
            now_t = time.time(); ts_ms = int((now_t - start_time) * 1000)
            rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB); mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

            p_res = plm.detect_for_video(mp_img, ts_ms)
            f_res = flm.detect_for_video(mp_img, ts_ms) if frame_idx % FACE_SKIP == 0 else None
            if f_res and f_res.face_landmarks: cached_flms = f_res.face_landmarks[0]
            frame_idx += 1

            paused, pause_reason, val, calib_countdown = False, "", 0.0, 0.0
            
            if p_res.pose_landmarks:
                plms = p_res.pose_landmarks[0]
                if calib_phase:
                    elapsed = now_t - calib_start
                    calib_countdown = max(0.0, CALIB_SEC - elapsed)
                    if cached_flms and not hand_near_shoulder(plms):
                        m_tmp = calc_metrics(cached_flms, plms)
                        if m_tmp: calib_buf["good"].append(m_tmp["face_norm"])
                    if elapsed >= CALIB_SEC:
                        if len(calib_buf["good"]) > 10:
                            calib_bl["good"] = sum(calib_buf["good"]) / len(calib_buf["good"])
                            calib_done["good"] = all_calib_done = True
                            minute_start_time = time.time()
                        calib_phase = None

                if cached_flms and not hand_near_shoulder(plms):
                    m = calc_metrics(cached_flms, plms)
                    if m:
                        val, last_sh_angle = m["face_norm"], m["sh_angle"]
                        last_val_f = oef(val, now_t)
                        if all_calib_done:
                            last_pos = max(0.0, (last_val_f - calib_bl["good"]) / calib_bl["good"])
                else:
                    paused, pause_reason = True, "Occluded/Lost"
            else:
                paused, pause_reason = True, "No Pose"

            # ── 1분 단위 누적 점수 업데이트 ──
            if all_calib_done:
                if now_t - last_sample_time >= SAMPLE_INTERVAL:
                    if not paused:
                        minute_samples.append((last_pos * 100) + abs(last_sh_angle))
                    last_sample_time = now_t
                
                minute_elapsed = now_t - minute_start_time
                if minute_elapsed >= REP_WINDOW_SEC:
                    if minute_samples:
                        last_rep_value = round(float(np.median(minute_samples)), 2)
                        
                        # 누적 점수 로직 적용
                        if last_rep_value <= sensitivity:
                            cumulative_score = 0.0  # 좋은 자세면 0으로 리셋
                        else:
                            cumulative_score += (last_rep_value - sensitivity)
                        
                        # 최대 100점 제한 및 단계 계산
                        cumulative_score = min(100.0, cumulative_score)
                        neck_stage = int(cumulative_score // 10) + 1
                        
                        # CSV 로그파일 저장
                        timestamp_str = datetime.datetime.now().strftime('%Y_%m_%d_%H:%M')
                        csv_writer.writerow([timestamp_str, last_rep_value])
                        csv_file.flush()
                    
                    minute_samples, minute_start_time = [], now_t

            draw_overlay(frame, last_pos, last_sh_angle, all_calib_done, calib_phase, calib_countdown, 
                         minute_samples, last_rep_value, (now_t - minute_start_time) if all_calib_done else 0,
                         sensitivity, cumulative_score, neck_stage)
            
            if paused and not calib_phase:
                cv2.putText(frame, f"PAUSED: {pause_reason}", (w//2-120, h//2), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0,0,255), 2)

            cv2.imshow("Geobugi v10 - Accumulator", frame)
            
            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"): break
            elif key == ord("c"):
                calib_phase, calib_start, calib_buf["good"] = "good", time.time(), []
                cumulative_score, neck_stage = 0.0, 1 # 캘리브레이션 시 리셋

    csv_file.close()
    cap.release(); cv2.destroyAllWindows()

if __name__ == "__main__":
    main()
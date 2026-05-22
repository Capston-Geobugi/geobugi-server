"""
예시 코드 : 실제 화면상 작동하지 않아요! 백에서 받아올 때 가이드라인 겸 만든 파일입니당
테스트하려면 옆의 cv_test.py나 face_shoulder.py를 실행하세요! cv_test.py는 화면 구분이나 명령 없이 전체 프로세스 보여주는 코드입니당
-------------------------------------------------------------------------
1. 백엔드(Node.js) -> cv (명령)
   - 파이썬의 표준 입력(stdin)으로 JSON 문자열 + 줄바꿈(\n)을 보냅니다.
   - 예: {"type": "SET_SENSITIVITY", "value": 15}\n : 민감도 조절하는거 옵션에서 조정하면 반영되게끔
   - 예: {"type": "START_CALIB"}\n : 캘리브레이션 창에서 값 받아오게끔

2. cv -> 백엔드/프론트(Node.js) (보고 및 전송)
   - 파이썬은 모든 결과를 표준 출력(stdout)으로 JSON을 쏩니다.
   - 백엔드는 이를 받아서 'type'에 따라 프론트로 보낼지 DB에 넣을지 결정합니다.
   
   A. [REALTIME_UPDATE] -> 프론트엔드용 (목 단계, 누적 점수)
      - 캐릭터 애니메이션을 위해 렌더러 프로세스로 토스 : 목 단계와 누적점수, pause 상태 보냄. pause는 화면상에 작게 측정안되고 있다는 알림 넣으면 좋을듯 해서 넣었어요
   
   B. [SESSION_DB_REPORT] -> 백엔드 DB용 (히스토리 로그)
      - 프로세스 종료 시 1회만 전송됩니다. DB에 insert 하세요. : 데일리 / monthly 리포트에 반영하는 값이에용 cv_test.py에서는 예시로 csv파일로 만들었어요
-------------------------------------------------------------------------
"""

import sys
import json
import time
import os
import threading
import base64
import platform
import subprocess
import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

# 모듈 : utils.py, cv_engine.py가 같은 폴더에 있어야함
from utils import OneEuroFilter, get_hand_near_shoulder, calculate_posture_metrics
from cv_engine import PostureEngine

# 경로 설정
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
POSE_MODEL = os.path.join(BASE_DIR, "models", "pose_landmarker_full.task")
FACE_MODEL = os.path.join(BASE_DIR, "models", "face_landmarker.task")

# 백엔드 명령 수신용 전역 큐
CMD_QUEUE = []
# 백엔드에서 CV 프로세스를 정상 종료시키기 위한 플래그
STOP_REQUESTED = False

IPHONE_CAMERA_KEYWORDS = ("iphone", "continuity camera")
BUILT_IN_CAMERA_KEYWORDS = ("facetime", "built-in", "macbook", "isight")
MAX_CAMERA_INDEX = 6

def send_to_node(msg_type, payload):
    """Node.js 백엔드로 JSON 데이터를 쏴주는 전송 함수"""
    message = {"type": msg_type, "payload": payload}
    print(json.dumps(message), flush=True)

def send_frame_to_node(frame):
    """Electron 측정 화면에 표시할 카메라 프레임을 전송"""
    preview = cv2.resize(frame, (512, 288))
    ok, encoded = cv2.imencode(".jpg", preview, [int(cv2.IMWRITE_JPEG_QUALITY), 72])
    if not ok:
        return
    jpg_base64 = base64.b64encode(encoded).decode("ascii")
    send_to_node("FRAME", {"src": f"data:image/jpeg;base64,{jpg_base64}"})

def is_macos():
    return platform.system() == "Darwin"

def is_windows():
    return platform.system() == "Windows"

def collect_camera_names(value):
    if isinstance(value, dict):
        names = []
        camera_name = value.get("_name")
        if isinstance(camera_name, str):
            names.append(camera_name)

        for child_value in value.values():
            names.extend(collect_camera_names(child_value))

        return names

    if isinstance(value, list):
        names = []
        for item in value:
            names.extend(collect_camera_names(item))

        return names

    return []

def get_macos_camera_names():
    try:
        result = subprocess.run(
            ["system_profiler", "SPCameraDataType", "-json"],
            capture_output=True,
            check=True,
            text=True,
            timeout=4
        )
        names = collect_camera_names(json.loads(result.stdout))
    except Exception as error:
        send_to_node("LOG", f"Camera list lookup failed: {error}")
        return []

    unique_names = []
    for name in names:
        if name not in unique_names:
            unique_names.append(name)

    return unique_names

def get_windows_camera_names():
    try:
        result = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                "Get-CimInstance Win32_PnPEntity | "
                "Where-Object { $_.PNPClass -eq 'Camera' -or $_.PNPClass -eq 'Image' } | "
                "Select-Object -ExpandProperty Name | ConvertTo-Json"
            ],
            capture_output=True,
            check=True,
            text=True,
            timeout=4
        )
        parsed_names = json.loads(result.stdout) if result.stdout.strip() else []
    except Exception as error:
        send_to_node("LOG", f"Camera list lookup failed: {error}")
        return []

    if isinstance(parsed_names, str):
        return [parsed_names]

    if isinstance(parsed_names, list):
        return [name for name in parsed_names if isinstance(name, str)]

    return []

def get_camera_names():
    if is_macos():
        return get_macos_camera_names()

    if is_windows():
        return get_windows_camera_names()

    return []

def is_iphone_camera(camera_name):
    normalized_name = camera_name.lower()
    return any(keyword in normalized_name for keyword in IPHONE_CAMERA_KEYWORDS)

def is_builtin_camera(camera_name):
    normalized_name = camera_name.lower()
    return any(keyword in normalized_name for keyword in BUILT_IN_CAMERA_KEYWORDS)

def get_camera_index_order(camera_names):
    index_count = max(MAX_CAMERA_INDEX, len(camera_names))
    candidate_indexes = list(range(index_count))

    if not camera_names:
        if is_macos():
            # Continuity Camera is often exposed as index 0 when macOS does not
            # return camera names. Try built-in/other indexes first and keep 0
            # only as the final fallback.
            return candidate_indexes[1:] + candidate_indexes[:1]

        return candidate_indexes

    allowed_indexes = []
    preferred_indexes = []

    for index in candidate_indexes:
        camera_name = camera_names[index] if index < len(camera_names) else ""
        if camera_name and is_iphone_camera(camera_name):
            send_to_node("LOG", f"Skipping iPhone camera: index={index}, name={camera_name}")
            continue

        if camera_name and is_builtin_camera(camera_name):
            preferred_indexes.append(index)
        else:
            allowed_indexes.append(index)

    return preferred_indexes + allowed_indexes

def create_video_capture(camera_index):
    if is_macos() and hasattr(cv2, "CAP_AVFOUNDATION"):
        return cv2.VideoCapture(camera_index, cv2.CAP_AVFOUNDATION)

    if is_windows() and hasattr(cv2, "CAP_DSHOW"):
        return cv2.VideoCapture(camera_index, cv2.CAP_DSHOW)

    return cv2.VideoCapture(camera_index)

def open_preferred_camera():
    camera_names = get_camera_names()
    camera_indexes = get_camera_index_order(camera_names)

    for camera_index in camera_indexes:
        cap = create_video_capture(camera_index)
        if not cap.isOpened():
            cap.release()
            continue

        ret, _frame = cap.read()
        if ret:
            camera_name = camera_names[camera_index] if camera_index < len(camera_names) else "unknown"
            send_to_node("LOG", f"Using camera: index={camera_index}, name={camera_name}")
            return cap

        cap.release()

    return None

def command_listener():
    """백엔드가 pyProcess.stdin.write()로 보낸 명령을 실시간 recieve"""
    global STOP_REQUESTED
    while True:
        line = sys.stdin.readline()
        if not line: break
        try:
            cmd = json.loads(line)
            if cmd.get('type') == 'STOP_PROCESS':
                # 앱 종료처럼 CV 프로세스 자체를 끝낼 때 사용
                STOP_REQUESTED = True
            else:
                CMD_QUEUE.append(cmd)
        except: pass

def main():
    engine = PostureEngine()
    oef = OneEuroFilter()
    
    # 1. 백엔드와 소통할 thread를 엽니다.
    threading.Thread(target=command_listener, daemon=True).start()

    # 내부 상태 변수
    calib_bl = None     # 캘리브레이션으로 잡은 바른 자세 기준값
    calib_phase = None  # 현재 캘리브레이션 중인가? ('running' / None)
    calib_start = 0
    calib_buf = []
    show_window = False # 카메라 화면(프리뷰)을 띄울지 여부

    cap = open_preferred_camera() # 카메라 기동
    if cap is None:
        send_to_node("CAMERA_ERROR", "iPhone 카메라를 제외한 사용 가능한 카메라를 찾을 수 없습니다. MacBook 내장 카메라 권한 또는 다른 앱의 카메라 사용 여부를 확인해주세요.")
        return

    last_frame_sent = 0.0
    
    # 2. MediaPipe 로드
    pose_opt = mp_vision.PoseLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=POSE_MODEL),
        running_mode=mp_vision.RunningMode.VIDEO, num_poses=1)
    face_opt = mp_vision.FaceLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path=FACE_MODEL),
        running_mode=mp_vision.RunningMode.VIDEO, num_faces=1)

    with (mp_vision.PoseLandmarker.create_from_options(pose_opt) as plm,
          mp_vision.FaceLandmarker.create_from_options(face_opt) as flm):
        
        try:
            # STOP_PROCESS 명령을 받으면 finally로 내려가 카메라/리소스를 정리
            while cap.isOpened() and not STOP_REQUESTED:
                now_t = time.time()

                # [STEP 1] 백엔드에서 시킨 일 처리 (민감도 조절, 캘리브레이션 시작 등)
                while CMD_QUEUE:
                    cmd = CMD_QUEUE.pop(0)
                    if cmd['type'] == 'SET_SENSITIVITY':
                        engine.sensitivity = float(cmd['value'])
                    elif cmd['type'] == 'SET_BASELINE':
                        calib_bl = float(cmd['value'])
                        calib_phase = None
                    elif cmd['type'] == 'SET_RUNTIME_STATE':
                        engine.import_runtime_state(cmd.get('value', {}))
                    elif cmd['type'] == 'START_CALIB':
                        calib_phase = 'running'
                        calib_start = now_t
                        calib_buf = []
                        show_window = False
                        send_to_node("STATUS", "CALIBRATION_STARTED")

                # [STEP 2] 영상 분석
                ret, frame = cap.read()
                if not ret:
                    send_to_node("CAMERA_ERROR", "카메라 프레임을 읽을 수 없습니다.")
                    break
                frame = cv2.flip(frame, 1)

                if now_t - last_frame_sent >= 0.1:
                    send_frame_to_node(frame)
                    last_frame_sent = now_t
                
                rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)
                p_res = plm.detect_for_video(mp_img, int(now_t * 1000))
                f_res = flm.detect_for_video(mp_img, int(now_t * 1000))

                paused = True
                score = 0

                if p_res.pose_landmarks and f_res.face_landmarks:
                    plms, flms = p_res.pose_landmarks[0], f_res.face_landmarks[0]
                    
                    if not get_hand_near_shoulder(plms):
                        metrics = calculate_posture_metrics(flms, plms)
                        if metrics:
                            paused = False
                            f_norm = oef(metrics["face_norm"], now_t)
                            
                            # 캘리브레이션 진행 중이면 5초간 데이터 수집
                            if calib_phase == 'running':
                                calib_buf.append(f_norm)
                                if now_t - calib_start >= 5.0:
                                    calib_bl = sum(calib_buf) / len(calib_buf)
                                    calib_phase = 'done'
                                    show_window = False
                                    cv2.destroyAllWindows() # 프리뷰 창 닫기
                                    send_to_node("CALIB_DONE", {"baseline": calib_bl})

                            # 기준값이 잡혔다면 실시간 점수 계산 시작
                            if calib_bl:
                                pos_pct = max(0.0, (f_norm - calib_bl) / calib_bl)
                                score = (pos_pct * 100) + abs(metrics["sh_angle"])
                                
                                # 엔진 업데이트 (1분 타이머 및 누적 점수 계산)
                                # 1분 경과 시 DB용 기록은 engine.db_session_history에 자동 누적됨
                                engine.process_frame_data(score, paused)
                                
                                # [프론트엔드 전용 전송] 거북이 목 애니메이션용 실시간 데이터
                                send_to_node("REALTIME_UPDATE", {
                                    "neck_stage": engine.neck_stage,
                                    "cumulative_score": round(engine.cumulative_score, 1),
                                    "is_paused": paused
                                })
                
                # [STEP 3] 캘리브레이션용 카메라 프리뷰
                if show_window:
                    cv2.putText(frame, f"CALIBRATING... {5 - int(now_t - calib_start)}s", (50, 50), 
                                cv2.FONT_HERSHEY_SIMPLEX, 0.8, (0, 255, 255), 2)
                    cv2.imshow("Geobugi Calibration Window", frame)
                    cv2.waitKey(1)

        finally:
            send_to_node("RUNTIME_STATE", engine.export_runtime_state())

            # 3. [백엔드 DB 전용 전송] 프로그램 종료 시 세션 전체 데이터를 한꺼번에 전송
            if engine.db_session_history:
                send_to_node("SESSION_DB_REPORT", {
                    "data": engine.db_session_history # [{timestamp, rep_value}, ...]
                })
            
            cap.release()
            cv2.destroyAllWindows()
            send_to_node("LOG", "Engine Process Terminated.")

if __name__ == "__main__":
    main()

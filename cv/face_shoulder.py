"""
거부기 - 자세 감지 v10
  주 지표: face_area / shoulder_width²  (거리·거북목 → 얼굴 크기 변화)
  1단계 개인 캘리브레이션 → good baseline 대비 % 증가량 표시

캘리브레이션:
  C : 바른 자세 5초

조작:
  S : 스냅샷  |  Q : 종료
"""

import csv, datetime, math, os, time, urllib.request
import cv2
import mediapipe as mp
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision as mp_vision

# ── 모델 파일 ──────────────────────────────────────────────────────────────
for path, url in [
    ("pose_landmarker_full.task",
     "https://storage.googleapis.com/mediapipe-models/"
     "pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task"),
    ("face_landmarker.task",
     "https://storage.googleapis.com/mediapipe-models/"
     "face_landmarker/face_landmarker/float16/latest/face_landmarker.task"),
]:
    if not os.path.exists(path):
        print(f"다운로드 중: {path}")
        urllib.request.urlretrieve(url, path)

# ── 상수 ──────────────────────────────────────────────────────────────────
POSE_L_SH, POSE_R_SH = 11, 12

UPPER_BODY_CONN = [(11, 12)]  # 어깨 너비 시각화
FACE_SKIP = 2    # face 모델: N프레임마다 실행 (주 지표라서 2로 설정)
CALIB_SEC = 5.0


# ── One Euro Filter ───────────────────────────────────────────────────────
class OneEuroFilter:
    def __init__(self, min_cutoff=0.1, beta=0.007, d_cutoff=1.0):
        self.min_cutoff = min_cutoff; self.beta = beta
        self.d_cutoff   = d_cutoff
        self._x = self._dx = self._t = None

    def _alpha(self, cutoff, freq):
        tau = 1.0 / (2.0 * math.pi * cutoff)
        return 1.0 / (1.0 + tau * freq)

    def __call__(self, x, t):
        if self._x is None:
            self._x = x; self._t = t; self._dx = 0.0; return x
        freq = 1.0 / max(t - self._t, 1e-6); self._t = t
        dx   = (x - self._x) * freq
        a_d  = self._alpha(self.d_cutoff, freq)
        self._dx = a_d * dx + (1 - a_d) * self._dx
        cutoff   = self.min_cutoff + self.beta * abs(self._dx)
        a        = self._alpha(cutoff, freq)
        self._x  = a * x + (1 - a) * self._x
        return self._x


# ── 지표 계산 ─────────────────────────────────────────────────────────────
HAND_SHOULDER_DIST = 0.20  # 손목-어깨 거리 임계값 (이 이하면 손이 어깨 근처)

def hand_near_shoulder(plms):
    l_sh = plms[POSE_L_SH]; r_sh = plms[POSE_R_SH]
    l_wr = plms[15];         r_wr = plms[16]
    d = HAND_SHOULDER_DIST
    return (
        math.dist((l_wr.x, l_wr.y), (l_sh.x, l_sh.y)) < d or
        math.dist((r_wr.x, r_wr.y), (r_sh.x, r_sh.y)) < d or
        math.dist((l_wr.x, l_wr.y), (r_sh.x, r_sh.y)) < d or
        math.dist((r_wr.x, r_wr.y), (l_sh.x, l_sh.y)) < d
    )

def calc_metrics(flms, plms):
    """face_norm : face_area / shoulder_width²  (거북목·전방 이동 시 증가)"""
    l_sh = plms[POSE_L_SH]
    r_sh = plms[POSE_R_SH]

    sw = abs(l_sh.x - r_sh.x)
    if sw < 0.01:
        return None

    xs = [lm.x for lm in flms]
    ys = [lm.y for lm in flms]
    face_area = (max(xs) - min(xs)) * (max(ys) - min(ys))
    face_norm = face_area / (sw ** 2)

    return {"face_norm": face_norm}


# ── 위치 비율 ─────────────────────────────────────────────────────────────
def calc_position(val, bl_good):
    """good baseline 대비 증가율 (0.0 = 바른 자세, 양수 = 거북목 방향)"""
    if bl_good < 1e-6:
        return 0.0
    return max(0.0, (val - bl_good) / bl_good)

def pos_color(pos):
    """증가율(0~) → 초록→빨강 BGR  (0.25 이상이면 완전 빨강)"""
    t = min(1.0, pos / 0.25)
    r = int(255 * t)
    g = int(255 * (1.0 - t))
    return (0, g, r)


# ── 게이지 ────────────────────────────────────────────────────────────────
def draw_gauge(frame, pos, val, bl_good):
    fh = frame.shape[0]
    gx = 22
    gy_top    = 50
    gy_bottom = fh - 50
    g_height  = gy_bottom - gy_top

    # 표시 범위: good baseline ± 30% 여유
    v_min = bl_good * 0.85
    v_max = bl_good * 1.35

    def to_y(v):
        v = max(v_min, min(v_max, v))
        return int(gy_top + (v - v_min) / (v_max - v_min) * g_height)

    y_good = to_y(bl_good)
    y_curr = to_y(val)

    # 게이지 배경 바 (회색)
    cv2.line(frame, (gx, gy_top), (gx, gy_bottom), (60, 60, 60), 3)

    # good 기준선
    cv2.line(frame, (gx-10, y_good), (gx+10, y_good), (60, 220, 60), 2)

    # 현재 위치 (흰 원)
    col = pos_color(pos)
    cv2.circle(frame, (gx, y_curr), 7, (255, 255, 255), -1)
    cv2.circle(frame, (gx, y_curr), 7, col, 2)


# ── 오버레이 ──────────────────────────────────────────────────────────────
def draw_overlay(frame, val, val_f, pos,
                 bl_good,
                 all_calib_done, calib_done, calib_phase, calib_countdown):
    h, w = frame.shape[:2]
    x0   = w - 420

    overlay = frame.copy()
    cv2.rectangle(overlay, (x0-10, 0), (w, 230), (20,20,20), -1)
    cv2.addWeighted(overlay, 0.65, frame, 0.35, 0, frame)

    if all_calib_done:
        pct = pos * 100
        col = pos_color(pos)
        cv2.putText(frame, f"POSTURE: +{pct:.1f}%",
                    (x0, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.9, col, 2)
        cv2.putText(frame, "0% = 바른자세 기준  (+% = 거북목 방향)",
                    (x0, 55), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (150,150,150), 1)
    else:
        cv2.putText(frame, "캘리브레이션 필요",
                    (x0, 35), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (150,150,150), 2)

    cv2.line(frame, (x0, 65), (w-10, 65), (80,80,80), 1)

    # 주 지표
    cv2.putText(frame,
                f"face_norm: {val_f:.4f} (raw:{val:.4f})",
                (x0, 82), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (210,210,210), 1)
    if all_calib_done:
        cv2.putText(frame,
                    f"  GOOD={bl_good:.4f}",
                    (x0, 98), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (180,180,180), 1)

    # 캘리브레이션 상태
    cv2.line(frame, (x0, 112), (w-10, 112), (60,60,60), 1)
    done = calib_done.get("good")
    col  = (60,220,60) if done else (100,100,100)
    cv2.putText(frame, f"{'✓' if done else '○'} C: 바른 자세",
                (x0, 130), cv2.FONT_HERSHEY_SIMPLEX, 0.40, col, 1)

    if calib_phase:
        cv2.putText(frame, f"캘리브레이션 중... {calib_countdown:.1f}s",
                    (x0, 155), cv2.FONT_HERSHEY_SIMPLEX, 0.55, (0,230,230), 2)

    cv2.putText(frame, "C:바른자세  S:스냅샷  Q:종료",
                (10, h-15), cv2.FONT_HERSHEY_SIMPLEX, 0.38, (120,120,120), 1)


def draw_skeleton(frame, lms, w, h, color):
    def pp(i): return int(lms[i].x*w), int(lms[i].y*h)
    for a, b in UPPER_BODY_CONN:
        if a < len(lms) and b < len(lms):
            cv2.line(frame, pp(a), pp(b), color, 2)
    for i in [POSE_L_SH, POSE_R_SH]:
        cv2.circle(frame, pp(i), 5, color, -1)

def draw_face_box(frame, flms, w, h, color):
    xs = [lm.x for lm in flms]
    ys = [lm.y for lm in flms]
    x1 = int(min(xs)*w); y1 = int(min(ys)*h)
    x2 = int(max(xs)*w); y2 = int(max(ys)*h)
    cv2.rectangle(frame, (x1,y1), (x2,y2), color, 2)


# ── 메인 ─────────────────────────────────────────────────────────────────
def main():
    pose_opt = mp_vision.PoseLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path="pose_landmarker_full.task"),
        running_mode=mp_vision.RunningMode.VIDEO,
        num_poses=1,
        min_pose_detection_confidence=0.7,
        min_pose_presence_confidence=0.7,
        min_tracking_confidence=0.7,
        output_segmentation_masks=False,
    )
    face_opt = mp_vision.FaceLandmarkerOptions(
        base_options=mp_python.BaseOptions(model_asset_path="face_landmarker.task"),
        running_mode=mp_vision.RunningMode.VIDEO,
        num_faces=1,
        min_face_detection_confidence=0.6,
        min_face_presence_confidence=0.6,
        min_tracking_confidence=0.6,
        output_face_blendshapes=False,
        output_facial_transformation_matrixes=False,
    )

    cap = cv2.VideoCapture(0)
    if not cap.isOpened(): print("웹캠 오류"); return
    time.sleep(1.0)
    ret, frame = cap.read()
    if not ret: print("카메라 오류"); cap.release(); return
    print(f"카메라: {frame.shape[1]}x{frame.shape[0]}")
    print("=== 거부기 v10 ===")
    print("C: 바른 자세  Q: 종료")

    oef = OneEuroFilter(0.1, 0.007)  # face_norm 필터

    calib_done  = {"good": False}
    calib_buf   = {"good": []}
    calib_bl    = {"good": None}
    calib_phase = None
    calib_start = 0.0

    all_calib_done = False

    # 캐시
    cached_flms  = None
    last_val_f   = 0.0
    last_pos     = 0.0
    paused       = False
    pause_reason = ""

    frame_idx  = 0
    start_time = time.time()
    last_print = 0.0
    snap_count = 0

    csv_fn = f"log_v10_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
    csv_f  = open(csv_fn, "w", newline="")
    csv_w  = csv.writer(csv_f)
    csv_w.writerow(["timestamp","calib","face_norm_raw","face_norm_f","position_pct"])
    print(f"CSV: {csv_fn}")

    with (mp_vision.PoseLandmarker.create_from_options(pose_opt) as plm,
          mp_vision.FaceLandmarker.create_from_options(face_opt) as flm):

        while cap.isOpened():
            ret, frame = cap.read()
            if not ret: break

            frame  = cv2.flip(frame, 1)
            h, w   = frame.shape[:2]
            now_t  = time.time()
            ts_ms  = int((now_t - start_time) * 1000)

            rgb    = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            mp_img = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb)

            p_res = plm.detect_for_video(mp_img, ts_ms)
            f_res = flm.detect_for_video(mp_img, ts_ms) if frame_idx % FACE_SKIP == 0 else None
            frame_idx += 1

            calib_countdown = 0.0
            val = 0.0

            if not p_res.pose_landmarks:
                paused = True; pause_reason = "자리 비움"
            else:
                plms = p_res.pose_landmarks[0]

                if f_res and f_res.face_landmarks:
                    cached_flms = f_res.face_landmarks[0]

                if cached_flms is None:
                    paused = True; pause_reason = "얼굴 인식 불가"
                elif hand_near_shoulder(plms):
                    paused = True; pause_reason = "어깨 가려짐"
                else:
                    m = calc_metrics(cached_flms, plms)
                    if m is None:
                        paused = True; pause_reason = "측정 불가"
                    else:
                        paused = False; pause_reason = ""
                        val   = m["face_norm"]
                        val_f = oef(val, now_t)
                        last_val_f = val_f

                        # 캘리브레이션
                        if calib_phase:
                            elapsed = now_t - calib_start
                            calib_countdown = max(0.0, CALIB_SEC - elapsed)
                            calib_buf[calib_phase].append(val)
                            if elapsed >= CALIB_SEC:
                                bl = sum(calib_buf[calib_phase]) / len(calib_buf[calib_phase])
                                calib_bl[calib_phase]   = bl
                                calib_done[calib_phase] = True
                                print(f"캘리브레이션 완료: GOOD={bl:.4f}")
                                calib_phase = None
                                oef = OneEuroFilter(0.1, 0.007)

                                if calib_done["good"]:
                                    all_calib_done = True

                        # 위치 계산
                        if all_calib_done:
                            last_pos = calc_position(last_val_f, calib_bl["good"])

                        # CSV
                        calib_tag = "done" if all_calib_done else (calib_phase or "pending")
                        csv_w.writerow([f"{now_t:.4f}", calib_tag,
                                        f"{val:.6f}", f"{last_val_f:.6f}",
                                        f"{last_pos*100:.1f}"])

                        if now_t - last_print >= 2.0:
                            last_print = now_t
                            print(f"pos={last_pos*100:.1f}%  face_norm={last_val_f:.4f}")

            # 그리기 (paused 여부 무관하게 항상)
            if p_res.pose_landmarks:
                col = pos_color(last_pos) if all_calib_done else (120,120,120)
                draw_skeleton(frame, p_res.pose_landmarks[0], w, h,
                              (150,150,150) if paused else col)
                if cached_flms:
                    draw_face_box(frame, cached_flms, w, h,
                                  (150,150,150) if paused else col)


            draw_overlay(frame, val, last_val_f, last_pos,
                         calib_bl["good"] or 0.0,
                         all_calib_done, calib_done,
                         calib_phase, calib_countdown)

            if paused:
                cv2.putText(frame, f"PAUSED  ({pause_reason})",
                            (w//2-160, h//2),
                            cv2.FONT_HERSHEY_SIMPLEX, 0.9, (150,150,150), 2)

            cv2.imshow("Geobugi v9", frame)

            key = cv2.waitKey(1) & 0xFF
            if key == ord("q"):
                break
            elif key == ord("c") and calib_phase is None:
                calib_phase = "good"; calib_start = time.time()
                calib_buf["good"] = []
                print("▶ 바른 자세로 5초 유지하세요...")
            elif key == ord("s"):
                fname = f"snapshot_{snap_count:03d}.png"
                cv2.imwrite(fname, frame); snap_count += 1
                print(f"스냅샷: {fname}")

    cap.release()
    cv2.destroyAllWindows()
    csv_f.close()
    print(f"종료. CSV: {csv_fn}")


if __name__ == "__main__":
    main()

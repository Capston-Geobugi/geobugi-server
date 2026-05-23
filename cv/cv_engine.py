import time
import numpy as np
import datetime

class PostureEngine:
    def __init__(self):
        self.sensitivity = 10.0
        self.rep_window_sec = 60.0
        self.cumulative_score = 0.0
        self.neck_stage = 1 #(1~10)단계; 애니메이션 작업 하면서 더 적게 바뀔 수도 잇슴당
        self.db_session_history = []
        self.minute_samples = []
        self.minute_start_time = time.time()
        self.last_sample_time = time.time()

    def export_runtime_state(self):
        now = time.time()

        return {
            "sensitivity": float(self.sensitivity),
            "cumulative_score": float(self.cumulative_score),
            "neck_stage": int(self.neck_stage),
            "minute_samples": [float(sample) for sample in self.minute_samples],
            "minute_elapsed_sec": max(0.0, now - self.minute_start_time)
        }

    def import_runtime_state(self, state):
        now = time.time()
        minute_elapsed_sec = float(state.get("minute_elapsed_sec", 0.0))

        self.sensitivity = float(state.get("sensitivity", self.sensitivity))
        self.cumulative_score = float(state.get("cumulative_score", self.cumulative_score))
        self.neck_stage = int(state.get("neck_stage", self.neck_stage))
        self.minute_samples = [
            float(sample)
            for sample in state.get("minute_samples", [])
            if isinstance(sample, (int, float))
        ]
        self.minute_start_time = now - min(max(0.0, minute_elapsed_sec), self.rep_window_sec)
        self.last_sample_time = now

    def update_logic(self, rep_value):
        """1분 단위 계산 및 데이터 분류 : 일단 소숫점 두자리에서 자르게 해놨는데 그냥 정수로 만들어도 크게 상관은 없을거 같아용"""
        rep_value = round(float(rep_value), 2)
        
        # 1. 프론트엔드용 실시간 점수/단계 업데이트
        if rep_value <= self.sensitivity:
            self.cumulative_score = 0.0
        else:
            #self.cumulative_score = min(100.0, self.cumulative_score + (rep_value - self.sensitivity)) -> 이렇게 하니까 너무 점수가 안나오는거 같아서 일단 아래처럼 했어요
            self.cumulative_score = min(100.0, self.cumulative_score + rep_value)
        self.neck_stage = int(self.cumulative_score // 10) + 1

        # 2. 백엔드 DB용 데이터 누적 (timestamp, rep_value)
        db_record = {
            "timestamp": datetime.datetime.now().strftime('%Y-%m-%d %H:%M'),
            "rep_value": rep_value
        }
        self.db_session_history.append(db_record)

    def flush_current_window(self):
        if self.minute_samples:
            rep_val = np.median(self.minute_samples)
            self.update_logic(rep_val)

        self.minute_samples = []
        self.minute_start_time = time.time()
        self.last_sample_time = self.minute_start_time

    def drain_session_history(self):
        records = self.db_session_history
        self.db_session_history = []
        return records

    def process_frame_data(self, current_score, is_paused):
        now = time.time()
        if now - self.last_sample_time >= 1.0:
            if not is_paused:
                self.minute_samples.append(current_score)
            self.last_sample_time = now
            
        elapsed = now - self.minute_start_time
        if elapsed >= self.rep_window_sec:
            self.flush_current_window()
            return True
        return False

import math
import numpy as np

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

def get_hand_near_shoulder(plms, sh_indices=[11, 12], wr_indices=[15, 16], threshold=0.18): #손 탐지해서 화면 멈추는 기능인데, 멈추는 동안은 반영 안되게 코드 짜놨습니당
    for s_idx in sh_indices:
        for w_idx in wr_indices:
            dist = math.dist((plms[s_idx].x, plms[s_idx].y), (plms[w_idx].x, plms[w_idx].y))
            if dist < threshold: return True
    return False

def calculate_posture_metrics(flms, plms):
    l_sh, r_sh = plms[11], plms[12]
    sw = abs(l_sh.x - r_sh.x)
    if sw < 0.01: return None
    
    xs, ys = [lm.x for lm in flms], [lm.y for lm in flms]
    face_area = (max(xs) - min(xs)) * (max(ys) - min(ys))
    face_norm = face_area / (sw ** 2)
    sh_angle = math.degrees(math.atan2(l_sh.y - r_sh.y, l_sh.x - r_sh.x))
    
    return {"face_norm": face_norm, "sh_angle": sh_angle}
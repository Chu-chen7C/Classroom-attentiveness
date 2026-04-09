import cv2
import numpy as np
import base64
import time
import logging
import os
from app.config import Config

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger('FaceService')

_cascade_face = None
_cascade_eye = None
_cascade_profile = None
_init_status = False
_track_state = {
    'last_ts': 0.0,
    'last_box': None,   # (x, y, w, h)
    'last_boxes': [],
    'last_count': 0,
}
_state_tracker = {
    'next_id': 1,
    'tracks': {},
}
_classroom_stats_window = {
    'samples': [],  # [{'ts': float, 'head_down_rate': float, 'head_up_rate': float, 'eyes_closed_rate': float}]
    'window_sec': 5.0,
}
_yolo_model = None
_yolo_ready = False
_yolo_names = {}
_pose_model = None
_pose_ready = False
_student_reid_bank = {}
_student_spatial_anchor = {}
_dnn_face_net = None
_dnn_ready = False
_calibration = {
    'min_face_area_ratio': 0.0045,
    'min_face_blur': 65.0,
    'min_match_confidence': 0.06,
    'min_match_margin': 0.045,
    'reid_similarity': 0.86,
    'reid_margin': 0.045,
    'id_confirm_min_votes': 2,
    'id_switch_min_votes': 3,
    'id_lock_sec': 2.2,
    'spatial_gate': 0.22,
    'spatial_switch_gate': 0.16,
    'cache_keep_sec': 4.5,
    'reid_update_min_conf': 0.18,
    'head_down_switch_extra_votes': 2,
    'live_face_conf_gate': 0.18,
    'face_reid_consistency_required': 1,
}
_calibration_profile = 'manual'
_calibration_profiles = {
    # 3-6m: close classroom camera (front row emphasis)
    'classroom_near': {
        'min_face_area_ratio': 0.0060,
        'min_face_blur': 62.0,
        'min_match_confidence': 0.07,
        'min_match_margin': 0.05,
        'reid_similarity': 0.86,
        'reid_margin': 0.05,
        'id_confirm_min_votes': 2,
        'id_switch_min_votes': 3,
        'id_lock_sec': 2.0,
        'spatial_gate': 0.24,
        'spatial_switch_gate': 0.18,
    },
    # 6-15m: standard classroom view (recommended default)
    'classroom_mid': {
        'min_face_area_ratio': 0.0045,
        'min_face_blur': 65.0,
        'min_match_confidence': 0.08,
        'min_match_margin': 0.055,
        'reid_similarity': 0.87,
        'reid_margin': 0.055,
        'id_confirm_min_votes': 2,
        'id_switch_min_votes': 4,
        'id_lock_sec': 2.4,
        'spatial_gate': 0.22,
        'spatial_switch_gate': 0.16,
        'cache_keep_sec': 4.8,
        'reid_update_min_conf': 0.2,
        'head_down_switch_extra_votes': 2,
        'live_face_conf_gate': 0.2,
        'face_reid_consistency_required': 1,
    },
    # 15m+ (long distance): stronger anti-false-match constraints
    'classroom_far': {
        'min_face_area_ratio': 0.0030,
        'min_face_blur': 72.0,
        'min_match_confidence': 0.11,
        'min_match_margin': 0.07,
        'reid_similarity': 0.90,
        'reid_margin': 0.07,
        'id_confirm_min_votes': 3,
        'id_switch_min_votes': 5,
        'id_lock_sec': 3.2,
        'spatial_gate': 0.18,
        'spatial_switch_gate': 0.12,
        'cache_keep_sec': 5.5,
        'reid_update_min_conf': 0.24,
        'head_down_switch_extra_votes': 3,
        'live_face_conf_gate': 0.24,
        'face_reid_consistency_required': 1,
    },
}


def _normalize_vector(vec):
    arr = np.array(vec, dtype=np.float32)
    norm = float(np.linalg.norm(arr))
    if norm <= 1e-8:
        return arr.tolist()
    return (arr / norm).tolist()


def _resample_vector(vec, target_dim):
    if target_dim <= 0:
        return []
    arr = np.array(vec, dtype=np.float32).flatten()
    if arr.size == 0:
        return [0.0] * target_dim
    if arr.size == target_dim:
        return arr.tolist()
    src_x = np.linspace(0.0, 1.0, num=arr.size)
    dst_x = np.linspace(0.0, 1.0, num=target_dim)
    out = np.interp(dst_x, src_x, arr)
    return out.tolist()


def _extract_identity_context_feature(image_bgr, face_bbox, target_dim):
    if image_bgr is None or target_dim <= 0 or face_bbox is None:
        return [0.0] * target_dim
    ih, iw = image_bgr.shape[:2]
    x, y, w, h = map(int, face_bbox)
    # Approximate upper-body ROI under face to improve identity robustness when face is partially occluded.
    x1 = max(0, x - int(0.45 * w))
    x2 = min(iw, x + int(1.45 * w))
    y1 = min(ih - 1, y + int(0.55 * h))
    y2 = min(ih, y + int(3.0 * h))
    if x2 <= x1 or y2 <= y1:
        return [0.0] * target_dim

    roi = image_bgr[y1:y2, x1:x2]
    if roi.size == 0:
        return [0.0] * target_dim
    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    h_hist = cv2.calcHist([hsv], [0], None, [16], [0, 180]).flatten()
    s_hist = cv2.calcHist([hsv], [1], None, [8], [0, 256]).flatten()
    v_hist = cv2.calcHist([hsv], [2], None, [8], [0, 256]).flatten()
    raw = np.concatenate([h_hist, s_hist, v_hist]).astype(np.float32)
    raw_sum = float(raw.sum())
    if raw_sum > 0:
        raw = raw / raw_sum
    ctx = _resample_vector(raw, target_dim)
    return _normalize_vector(ctx)


def _evaluate_face_roi_quality(face_gray, image_shape, face_bbox):
    if face_gray is None or face_gray.size == 0:
        return {'ok': False, 'score': 0.0, 'reason': 'empty_face'}
    ih, iw = image_shape[:2]
    x, y, w, h = map(int, face_bbox)
    blur_val = float(cv2.Laplacian(face_gray, cv2.CV_64F).var())
    mean_light = float(np.mean(face_gray))
    area_ratio = float((w * h) / max(1.0, ih * iw))
    # Weighted quality score.
    blur_score = min(1.0, blur_val / 180.0)
    light_score = max(0.0, 1.0 - abs(mean_light - 130.0) / 110.0)
    area_score = min(1.0, area_ratio / 0.02)  # face should take at least ~2% of frame for stable enroll
    quality = 0.45 * blur_score + 0.25 * light_score + 0.30 * area_score
    ok = blur_val >= 55.0 and area_ratio >= 0.004 and (45.0 <= mean_light <= 225.0)
    reason = 'ok' if ok else f'blur={blur_val:.1f},light={mean_light:.1f},area={area_ratio:.4f}'
    return {'ok': ok, 'score': round(float(quality), 4), 'reason': reason}

def _iou(a, b):
    ax1, ay1, aw, ah = a
    bx1, by1, bw, bh = b
    ax2, ay2 = ax1 + aw, ay1 + ah
    bx2, by2 = bx1 + bw, by1 + bh

    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)

    inter_w = max(0, inter_x2 - inter_x1)
    inter_h = max(0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h
    if inter_area == 0:
        return 0.0

    area_a = aw * ah
    area_b = bw * bh
    union = area_a + area_b - inter_area
    if union <= 0:
        return 0.0
    return inter_area / union


def _deduplicate_boxes(raw_boxes, iou_threshold=0.35):
    """
    对级联检测结果做简单 NMS 去重，避免单人多框。
    """
    if raw_boxes is None or len(raw_boxes) == 0:
        return []

    boxes = [tuple(map(int, b)) for b in raw_boxes]
    boxes.sort(key=lambda x: x[2] * x[3], reverse=True)

    kept = []
    for box in boxes:
        if all(_iou(box, k) < iou_threshold for k in kept):
            kept.append(box)
    return kept


def _merge_nearby_boxes(boxes, center_dist_ratio=0.35):
    """
    合并中心点非常接近的框，减少同一人被拆分成多个框。
    """
    if not boxes:
        return []

    remaining = [tuple(map(int, b)) for b in boxes]
    merged = []

    while remaining:
        bx = remaining.pop(0)
        cx = bx[0] + bx[2] / 2.0
        cy = bx[1] + bx[3] / 2.0
        base_size = max(bx[2], bx[3])

        group = [bx]
        rest = []
        for other in remaining:
            ocx = other[0] + other[2] / 2.0
            ocy = other[1] + other[3] / 2.0
            dist = ((cx - ocx) ** 2 + (cy - ocy) ** 2) ** 0.5
            threshold = center_dist_ratio * max(base_size, max(other[2], other[3]))
            if dist <= threshold:
                group.append(other)
            else:
                rest.append(other)
        remaining = rest

        if len(group) == 1:
            merged.append(group[0])
            continue

        x1 = min(g[0] for g in group)
        y1 = min(g[1] for g in group)
        x2 = max(g[0] + g[2] for g in group)
        y2 = max(g[1] + g[3] for g in group)
        merged.append((int(x1), int(y1), int(x2 - x1), int(y2 - y1)))

    return merged


def _filter_boxes_by_geometry(boxes, image_shape):
    """
    过滤异常框（过小、过扁/过高），提升人数统计稳定性。
    """
    if not boxes:
        return []

    img_h, img_w = image_shape[:2]
    img_area = img_h * img_w
    min_area = max(900, int(img_area * 0.002))
    max_area = int(img_area * 0.7)

    filtered = []
    for x, y, w, h in boxes:
        if w <= 0 or h <= 0:
            continue
        area = w * h
        if area < min_area or area > max_area:
            continue
        ratio = w / float(h)
        if ratio < 0.55 or ratio > 1.75:
            continue
        filtered.append((x, y, w, h))
    return filtered


def _stabilize_face_boxes(raw_boxes, image_shape):
    boxes = _deduplicate_boxes(raw_boxes, iou_threshold=0.35)
    boxes = _merge_nearby_boxes(boxes, center_dist_ratio=0.35)
    boxes = _deduplicate_boxes(boxes, iou_threshold=0.4)
    boxes = _filter_boxes_by_geometry(boxes, image_shape)
    boxes.sort(key=lambda b: b[2] * b[3], reverse=True)
    return boxes


def _apply_temporal_single_person_stabilization(boxes):
    """
    解决人物运动时单人被误检为多人：
    - 若上一帧稳定为单人，当前帧突然多框，则优先保留最接近历史轨迹的一个框。
    - 对保留框做轻量平滑，降低跳变。
    """
    now = time.perf_counter()
    last_box = _track_state['last_box']
    last_boxes = _track_state.get('last_boxes', [])
    last_count = _track_state['last_count']
    last_ts = _track_state['last_ts']

    if not boxes:
        _track_state['last_ts'] = now
        _track_state['last_count'] = 0
        _track_state['last_box'] = None
        _track_state['last_boxes'] = []
        return boxes

    # 历史有效窗口：1.2s 内认为是连续视频流
    recent = (now - last_ts) < 1.2 and last_box is not None

    selected = boxes
    if recent and last_count > 0 and len(boxes) > (last_count + 1):
        def min_dist_to_last(b):
            cx = b[0] + b[2] / 2.0
            cy = b[1] + b[3] / 2.0
            if not last_boxes:
                return 0.0
            dists = []
            for lb in last_boxes:
                lcx = lb[0] + lb[2] / 2.0
                lcy = lb[1] + lb[3] / 2.0
                dists.append(((cx - lcx) ** 2 + (cy - lcy) ** 2) ** 0.5)
            return min(dists)

        selected = sorted(boxes, key=min_dist_to_last)[:max(1, last_count)]

    if recent and last_count == 1 and len(selected) > 1:
        lcx = last_box[0] + last_box[2] / 2.0
        lcy = last_box[1] + last_box[3] / 2.0

        def score(b):
            cx = b[0] + b[2] / 2.0
            cy = b[1] + b[3] / 2.0
            center_dist = ((cx - lcx) ** 2 + (cy - lcy) ** 2) ** 0.5
            area_ratio = abs((b[2] * b[3]) - (last_box[2] * last_box[3])) / max(1.0, (last_box[2] * last_box[3]))
            return center_dist + area_ratio * 80.0

        best = min(boxes, key=score)
        selected = [best]

    # 单框平滑，减少轻微抖动
    if len(selected) == 1 and recent and last_box is not None:
        cx = int(round(last_box[0] * 0.35 + selected[0][0] * 0.65))
        cy = int(round(last_box[1] * 0.35 + selected[0][1] * 0.65))
        cw = int(round(last_box[2] * 0.35 + selected[0][2] * 0.65))
        ch = int(round(last_box[3] * 0.35 + selected[0][3] * 0.65))
        selected = [(cx, cy, cw, ch)]

    _track_state['last_ts'] = now
    _track_state['last_count'] = len(selected)
    _track_state['last_box'] = selected[0] if len(selected) == 1 else None
    _track_state['last_boxes'] = selected[:]
    return selected


def _center(box):
    x, y, w, h = box
    return (x + w / 2.0, y + h / 2.0)


def _match_track_id(bbox, now_ts):
    tracks = _state_tracker['tracks']
    best_id = None
    best_score = -1.0
    bx = tuple(map(int, bbox))
    bcx, bcy = _center(bx)

    for tid, tr in list(tracks.items()):
        if (now_ts - tr.get('last_seen', 0.0)) > 2.0:
            continue
        tb = tr.get('bbox')
        if not tb:
            continue
        iou_v = _iou(bx, tb)
        tcx, tcy = _center(tb)
        center_dist = ((bcx - tcx) ** 2 + (bcy - tcy) ** 2) ** 0.5
        norm = max(1.0, max(tb[2], tb[3], bx[2], bx[3]))
        proximity = max(0.0, 1.0 - center_dist / (norm * 2.2))
        score = iou_v * 0.75 + proximity * 0.25
        if score > best_score:
            best_score = score
            best_id = tid

    if best_id is not None and best_score >= 0.33:
        return best_id

    tid = _state_tracker['next_id']
    _state_tracker['next_id'] += 1
    tracks[tid] = {
        'bbox': bx,
        'stable_state': None,
        'history': [],
        'attention_ema': None,
        'eye_history': [],
        'last_seen': now_ts,
        'identity_cache': None,
    }
    return tid


def _stabilize_face_state(bbox, raw_state, raw_score, raw_eye_status, now_ts):
    tid = _match_track_id(bbox, now_ts)
    track = _state_tracker['tracks'][tid]

    old_bbox = track.get('bbox', tuple(map(int, bbox)))
    nx, ny, nw, nh = map(int, bbox)
    ox, oy, ow, oh = old_bbox
    smooth_bbox = (
        int(round(ox * 0.3 + nx * 0.7)),
        int(round(oy * 0.3 + ny * 0.7)),
        int(round(ow * 0.3 + nw * 0.7)),
        int(round(oh * 0.3 + nh * 0.7)),
    )
    track['bbox'] = smooth_bbox
    track['last_seen'] = now_ts

    history = track.get('history', [])
    history.append(raw_state)
    if len(history) > 7:
        history = history[-7:]
    track['history'] = history

    eye_history = track.get('eye_history', [])
    eye_history.append(raw_eye_status)
    if len(eye_history) > 5:
        eye_history = eye_history[-5:]
    track['eye_history'] = eye_history

    stable_state = track.get('stable_state')
    counts = {}
    for s in history:
        counts[s] = counts.get(s, 0) + 1
    top_state = max(counts.keys(), key=lambda k: counts[k]) if counts else raw_state
    top_count = counts.get(top_state, 0)

    if stable_state is None:
        stable_state = top_state
    elif top_state != stable_state:
        # 闭眼状态切换需要更快响应，其他姿态切换要求更高一致性
        quick_states = {'eyes_closed_both', 'eyes_closed_single'}
        switch_threshold = 2 if (top_state in quick_states or stable_state in quick_states) else 4
        if top_count >= switch_threshold:
            stable_state = top_state
    track['stable_state'] = stable_state

    prev_ema = track.get('attention_ema')
    if prev_ema is None:
        attention_ema = float(raw_score)
    else:
        attention_ema = prev_ema * 0.62 + float(raw_score) * 0.38
    track['attention_ema'] = attention_ema

    stable_eye = raw_eye_status
    if stable_state == 'eyes_closed_both':
        stable_eye = 'both_closed'
    elif stable_state == 'eyes_closed_single':
        stable_eye = 'single_closed'
    elif eye_history:
        stable_eye = max(set(eye_history), key=eye_history.count)

    # 周期清理过期轨迹，避免追踪字典无限增长
    if len(_state_tracker['tracks']) > 32:
        for k in list(_state_tracker['tracks'].keys()):
            if (now_ts - _state_tracker['tracks'][k].get('last_seen', 0.0)) > 2.5:
                del _state_tracker['tracks'][k]

    return {
        'bbox': smooth_bbox,
        'state': stable_state,
        'attention_score': round(attention_ema, 2),
        'eye_status': stable_eye,
        'track_id': tid,
    }


def _compute_frame_classroom_rates(results):
    total = len(results)
    if total <= 0:
        return {
            'head_down_rate': 0.0,
            'head_up_rate': 0.0,
            'eyes_closed_rate': 0.0,
            'turning_head_rate': 0.0,
        }

    head_down = 0
    head_up = 0
    eyes_closed = 0
    turning = 0

    for r in results:
        s = r.get('state_type')
        if s == 'head_down':
            head_down += 1
        if s == 'head_up':
            head_up += 1
        if s in ('eyes_closed_both', 'eyes_closed_single'):
            eyes_closed += 1
        if s in ('looking_left', 'looking_right'):
            turning += 1

    return {
        'head_down_rate': round(head_down / total * 100, 1),
        'head_up_rate': round(head_up / total * 100, 1),
        'eyes_closed_rate': round(eyes_closed / total * 100, 1),
        'turning_head_rate': round(turning / total * 100, 1),
    }


def _update_classroom_stats_window(frame_rates, now_ts):
    samples = _classroom_stats_window['samples']
    window_sec = _classroom_stats_window.get('window_sec', 5.0)

    samples.append({
        'ts': now_ts,
        'head_down_rate': float(frame_rates.get('head_down_rate', 0.0)),
        'head_up_rate': float(frame_rates.get('head_up_rate', 0.0)),
        'eyes_closed_rate': float(frame_rates.get('eyes_closed_rate', 0.0)),
        'turning_head_rate': float(frame_rates.get('turning_head_rate', 0.0)),
    })

    cutoff = now_ts - window_sec
    samples = [s for s in samples if s['ts'] >= cutoff]
    _classroom_stats_window['samples'] = samples

    if not samples:
        return {
            'windowSec': window_sec,
            'headDownRate': 0.0,
            'headUpRate': 0.0,
            'eyesClosedRate': 0.0,
            'turningHeadRate': 0.0,
            'sampleCount': 0,
        }

    n = float(len(samples))
    return {
        'windowSec': window_sec,
        'headDownRate': round(sum(s['head_down_rate'] for s in samples) / n, 1),
        'headUpRate': round(sum(s['head_up_rate'] for s in samples) / n, 1),
        'eyesClosedRate': round(sum(s['eyes_closed_rate'] for s in samples) / n, 1),
        'turningHeadRate': round(sum(s['turning_head_rate'] for s in samples) / n, 1),
        'sampleCount': int(n),
    }


def _init_yolov10():
    global _yolo_model, _yolo_ready, _yolo_names
    if _yolo_ready and _yolo_model is not None:
        return True
    try:
        from ultralytics import YOLO
    except Exception as e:
        logger.warning(f"[YOLOv10] ultralytics not available: {e}")
        _yolo_ready = False
        return False

    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    project_dir = os.path.dirname(backend_dir)
    candidates = [
        os.path.join(project_dir, 'models', 'yolov10n.pt'),
        os.path.join(backend_dir, 'models', 'yolov10n.pt'),
        'yolov10n.pt',
    ]
    for weight in candidates:
        try:
            model_path = weight
            if os.path.exists(weight):
                # Avoid potential Unicode path issues in some runtime environments.
                import shutil
                import tempfile
                tmp_model = os.path.join(tempfile.gettempdir(), 'yolov10n_runtime.pt')
                shutil.copy2(weight, tmp_model)
                model_path = tmp_model
            _yolo_model = YOLO(model_path)
            _yolo_names = getattr(_yolo_model, 'names', {}) or {}
            _yolo_ready = True
            logger.info(f"[YOLOv10] initialized with weights: {model_path}")
            return True
        except Exception:
            continue
    _yolo_ready = False
    logger.warning("[YOLOv10] initialization failed; fallback to face-only mode")
    return False


def _analyze_scene_with_yolo(image_bgr):
    if not _init_yolov10():
        return {'ready': False, 'persons': [], 'objects': []}
    try:
        preds = _yolo_model.predict(
            source=image_bgr,
            imgsz=960,
            conf=0.25,
            iou=0.45,
            verbose=False
        )
        if not preds:
            return {'ready': True, 'persons': [], 'objects': []}
        result = preds[0]
        boxes = result.boxes
        if boxes is None:
            return {'ready': True, 'persons': [], 'objects': []}

        persons = []
        objects = []
        xyxy = boxes.xyxy.cpu().numpy()
        confs = boxes.conf.cpu().numpy()
        clses = boxes.cls.cpu().numpy().astype(int)
        for i in range(len(xyxy)):
            x1, y1, x2, y2 = xyxy[i]
            conf = float(confs[i])
            cls = int(clses[i])
            name = str(_yolo_names.get(cls, cls))
            w = max(0, int(x2 - x1))
            h = max(0, int(y2 - y1))
            if w <= 0 or h <= 0:
                continue
            box = [int(x1), int(y1), w, h]
            item = {'bbox': box, 'confidence': conf, 'class': name}
            if name == 'person':
                persons.append(item)
            else:
                objects.append(item)
        return {'ready': True, 'persons': persons, 'objects': objects}
    except Exception as e:
        logger.warning(f"[YOLOv10] inference failed: {e}")
        return {'ready': bool(_yolo_ready), 'persons': [], 'objects': []}


def _init_pose_model():
    global _pose_model, _pose_ready
    if _pose_ready and _pose_model is not None:
        return True
    try:
        from ultralytics import YOLO
        _pose_model = YOLO('yolov8n-pose.pt')
        _pose_ready = True
        logger.info("[Pose] initialized with yolov8n-pose.pt")
        return True
    except Exception as e:
        logger.warning(f"[Pose] initialization failed: {e}")
        _pose_ready = False
        return False


def _analyze_pose_keypoints(image_bgr):
    if not _init_pose_model():
        return {'ready': False, 'persons': []}
    try:
        preds = _pose_model.predict(
            source=image_bgr,
            imgsz=960,
            conf=0.25,
            iou=0.45,
            verbose=False
        )
        if not preds:
            return {'ready': True, 'persons': []}
        result = preds[0]
        if result.boxes is None or result.keypoints is None:
            return {'ready': True, 'persons': []}

        xyxy = result.boxes.xyxy.cpu().numpy()
        confs = result.boxes.conf.cpu().numpy()
        kxy = result.keypoints.xy.cpu().numpy()  # [n, 17, 2]
        out = []
        for i in range(len(xyxy)):
            x1, y1, x2, y2 = xyxy[i]
            box = [int(x1), int(y1), max(1, int(x2 - x1)), max(1, int(y2 - y1))]
            pts = kxy[i].tolist() if i < len(kxy) else []
            out.append({
                'bbox': box,
                'confidence': float(confs[i]),
                'keypoints': pts
            })
        return {'ready': True, 'persons': out}
    except Exception as e:
        logger.warning(f"[Pose] inference failed: {e}")
        return {'ready': bool(_pose_ready), 'persons': []}


def _merge_person_pose(persons, pose_persons):
    if not persons:
        return []
    merged = []
    for p in persons:
        best_pose = None
        best_iou = 0.0
        for pp in pose_persons:
            ov = _iou(tuple(p['bbox']), tuple(pp['bbox']))
            if ov > best_iou:
                best_iou = ov
                best_pose = pp
        item = dict(p)
        if best_pose is not None and best_iou >= 0.15:
            item['keypoints'] = best_pose.get('keypoints', [])
            item['pose_confidence'] = best_pose.get('confidence', 0.0)
        else:
            item['keypoints'] = []
            item['pose_confidence'] = 0.0
        merged.append(item)
    return merged


def _pose_behavior_flags(person_bbox, keypoints):
    if not keypoints or len(keypoints) < 11:
        return {
            'handRaised': False,
            'headDownPose': False,
            'headUpPose': False,
            'turningHeadPose': False
        }
    # COCO indices: nose=0, l_shoulder=5, r_shoulder=6, l_wrist=9, r_wrist=10
    nose = keypoints[0]
    ls = keypoints[5]
    rs = keypoints[6]
    lw = keypoints[9]
    rw = keypoints[10]

    sh_y = (ls[1] + rs[1]) / 2.0
    sh_x = (ls[0] + rs[0]) / 2.0
    hand_raised = (lw[1] < sh_y - 10) or (rw[1] < sh_y - 10)
    head_down = nose[1] > sh_y + 10
    head_up = nose[1] < sh_y - 18
    turning = abs(nose[0] - sh_x) > 28
    return {
        'handRaised': bool(hand_raised),
        'headDownPose': bool(head_down),
        'headUpPose': bool(head_up),
        'turningHeadPose': bool(turning)
    }


def _find_person_for_face(face_bbox, persons):
    if not persons:
        return None
    fx, fy, fw, fh = face_bbox
    fc = (fx + fw / 2.0, fy + fh / 2.0)
    best = None
    best_score = -1.0
    for p in persons:
        px, py, pw, ph = p['bbox']
        contains = (px <= fc[0] <= px + pw) and (py <= fc[1] <= py + ph)
        if not contains:
            continue
        overlap = _iou(face_bbox, p['bbox'])
        if overlap > best_score:
            best_score = overlap
            best = p
    if best is not None:
        return best
    return min(persons, key=lambda p: abs((p['bbox'][0] + p['bbox'][2] / 2.0) - fc[0]))


def _compute_motion_score(current_gray, prev_gray):
    if prev_gray is None or current_gray is None:
        return 0.0
    if current_gray.shape != prev_gray.shape:
        prev_gray = cv2.resize(prev_gray, (current_gray.shape[1], current_gray.shape[0]))
    diff = cv2.absdiff(current_gray, prev_gray)
    return float(np.mean(diff) / 255.0)


def _cosine_similarity(a, b):
    va = np.array(a, dtype=np.float32)
    vb = np.array(b, dtype=np.float32)
    na = float(np.linalg.norm(va))
    nb = float(np.linalg.norm(vb))
    if na <= 1e-8 or nb <= 1e-8:
        return 0.0
    return float(np.dot(va, vb) / (na * nb))


def _extract_reid_embedding(image_bgr, person_bbox, target_dim=128):
    if image_bgr is None or person_bbox is None:
        return [0.0] * target_dim
    ih, iw = image_bgr.shape[:2]
    x, y, w, h = map(int, person_bbox)
    x1 = max(0, x)
    y1 = max(0, y)
    x2 = min(iw, x + w)
    y2 = min(ih, y + h)
    if x2 <= x1 or y2 <= y1:
        return [0.0] * target_dim
    roi = image_bgr[y1:y2, x1:x2]
    if roi.size == 0:
        return [0.0] * target_dim

    hsv = cv2.cvtColor(roi, cv2.COLOR_BGR2HSV)
    h_hist = cv2.calcHist([hsv], [0], None, [24], [0, 180]).flatten()
    s_hist = cv2.calcHist([hsv], [1], None, [16], [0, 256]).flatten()
    v_hist = cv2.calcHist([hsv], [2], None, [16], [0, 256]).flatten()

    gray = cv2.cvtColor(roi, cv2.COLOR_BGR2GRAY)
    gray = cv2.resize(gray, (64, 128))
    gx = cv2.Sobel(gray, cv2.CV_32F, 1, 0, ksize=3)
    gy = cv2.Sobel(gray, cv2.CV_32F, 0, 1, ksize=3)
    mag, ang = cv2.cartToPolar(gx, gy, angleInDegrees=True)
    hog_like, _ = np.histogram(ang, bins=24, range=(0, 360), weights=mag)

    feat = np.concatenate([h_hist, s_hist, v_hist, hog_like]).astype(np.float32)
    s = float(feat.sum())
    if s > 0:
        feat = feat / s
    feat = _resample_vector(feat, target_dim)
    feat = _normalize_vector(feat)
    return [float(x) for x in feat]


def _update_student_reid_bank(student_id, reid_embedding):
    if not student_id or reid_embedding is None:
        return
    old = _student_reid_bank.get(student_id)
    if old is None:
        _student_reid_bank[student_id] = reid_embedding
        return
    old_v = np.array(old, dtype=np.float32)
    new_v = np.array(reid_embedding, dtype=np.float32)
    mixed = old_v * 0.7 + new_v * 0.3
    _student_reid_bank[student_id] = _normalize_vector(mixed)


def _match_student_by_reid(reid_embedding):
    if reid_embedding is None or len(_student_reid_bank) == 0:
        return None
    best_id = None
    best_sim = -1.0
    second_sim = -1.0
    for sid, proto in _student_reid_bank.items():
        sim = _cosine_similarity(reid_embedding, proto)
        if sim > best_sim:
            second_sim = best_sim
            best_sim = sim
            best_id = sid
        elif sim > second_sim:
            second_sim = sim
    margin = best_sim - max(0.0, second_sim)
    sim_thr = float(_calibration.get('reid_similarity', 0.86))
    margin_thr = float(_calibration.get('reid_margin', 0.045))
    if best_sim >= sim_thr and margin >= margin_thr:
        return {'studentId': best_id, 'similarity': round(best_sim, 4), 'margin': round(margin, 4)}
    return None


def _stabilize_identity_for_track(track_id, candidate_student, candidate_confidence, now_ts, face_bbox=None, image_shape=None, current_state=None):
    if track_id is None:
        return candidate_student
    tr = _state_tracker['tracks'].get(track_id)
    if tr is None:
        return candidate_student

    state = tr.get('identity_state')
    if state is None:
        state = {
            'confirmed': None,
            'confirmed_ts': 0.0,
            'votes': {},
        }
    votes = state.get('votes', {})
    # Apply seat-position consistency to candidate confidence in classroom scenes.
    if candidate_student and face_bbox is not None and image_shape is not None:
        sid = str(candidate_student.get('id', ''))
        anc = _student_spatial_anchor.get(sid)
        if anc is not None:
            ih, iw = image_shape[:2]
            fx, fy, fw, fh = map(float, face_bbox)
            cx = (fx + fw / 2.0) / max(1.0, iw)
            cy = (fy + fh / 2.0) / max(1.0, ih)
            dist = ((cx - anc[0]) ** 2 + (cy - anc[1]) ** 2) ** 0.5
            if dist > float(_calibration.get('spatial_gate', 0.22)):
                candidate_confidence *= 0.55
    if candidate_student:
        sid = str(candidate_student.get('id', ''))
        if sid:
            votes[sid] = votes.get(sid, 0) + (2 if candidate_confidence >= 0.2 else 1)
    # decay old votes slowly
    for sid in list(votes.keys()):
        votes[sid] = max(0, votes[sid] - 0.2)
        if votes[sid] <= 0:
            votes.pop(sid, None)
    state['votes'] = votes

    confirmed = state.get('confirmed')
    lock_sec = float(_calibration.get('id_lock_sec', 2.2))
    confirm_votes = int(_calibration.get('id_confirm_min_votes', 2))
    switch_votes = int(_calibration.get('id_switch_min_votes', 3))

    if confirmed is None:
        if candidate_student:
            sid = str(candidate_student.get('id', ''))
            if votes.get(sid, 0) >= confirm_votes:
                confirmed = candidate_student
                state['confirmed_ts'] = now_ts
    else:
        current_sid = str(confirmed.get('id', ''))
        within_lock = (now_ts - float(state.get('confirmed_ts', 0.0))) <= lock_sec
        if candidate_student:
            cand_sid = str(candidate_student.get('id', ''))
            if cand_sid != current_sid and not within_lock:
                can_switch = True
                if face_bbox is not None and image_shape is not None:
                    anc = _student_spatial_anchor.get(cand_sid)
                    if anc is not None:
                        ih, iw = image_shape[:2]
                        fx, fy, fw, fh = map(float, face_bbox)
                        cx = (fx + fw / 2.0) / max(1.0, iw)
                        cy = (fy + fh / 2.0) / max(1.0, ih)
                        dist = ((cx - anc[0]) ** 2 + (cy - anc[1]) ** 2) ** 0.5
                        can_switch = dist <= float(_calibration.get('spatial_switch_gate', 0.16))
                required_votes = switch_votes
                if current_state == 'head_down':
                    required_votes += int(_calibration.get('head_down_switch_extra_votes', 2))
                if can_switch and votes.get(cand_sid, 0) >= required_votes:
                    confirmed = candidate_student
                    state['confirmed_ts'] = now_ts
            elif cand_sid == current_sid:
                state['confirmed_ts'] = now_ts

    state['confirmed'] = confirmed
    tr['identity_state'] = state
    if confirmed is not None and face_bbox is not None and image_shape is not None:
        sid = str(confirmed.get('id', ''))
        ih, iw = image_shape[:2]
        fx, fy, fw, fh = map(float, face_bbox)
        cx = (fx + fw / 2.0) / max(1.0, iw)
        cy = (fy + fh / 2.0) / max(1.0, ih)
        old = _student_spatial_anchor.get(sid)
        if old is None:
            _student_spatial_anchor[sid] = (cx, cy)
        else:
            _student_spatial_anchor[sid] = (old[0] * 0.86 + cx * 0.14, old[1] * 0.86 + cy * 0.14)
    return confirmed if confirmed is not None else candidate_student


def get_calibration():
    payload = dict(_calibration)
    payload['profile'] = _calibration_profile
    payload['cameraDistanceM'] = float(getattr(Config, 'CAMERA_DISTANCE_M', 10.0))
    payload['cameraFovDeg'] = float(getattr(Config, 'CAMERA_FOV_DEG', 78.0))
    return payload


def update_calibration(data: dict):
    global _calibration_profile
    if not isinstance(data, dict):
        return get_calibration()
    profile = data.get('profile')
    if isinstance(profile, str) and profile in _calibration_profiles:
        _calibration.update(_calibration_profiles[profile])
        _calibration_profile = profile
    float_keys = {
        'min_face_area_ratio', 'min_face_blur', 'min_match_confidence',
        'min_match_margin', 'reid_similarity', 'reid_margin', 'id_lock_sec',
        'spatial_gate', 'spatial_switch_gate', 'cache_keep_sec', 'reid_update_min_conf',
        'live_face_conf_gate'
    }
    int_keys = {'id_confirm_min_votes', 'id_switch_min_votes', 'head_down_switch_extra_votes', 'face_reid_consistency_required'}
    for k, v in data.items():
        if k in float_keys:
            try:
                _calibration[k] = float(v)
            except Exception:
                pass
        elif k in int_keys:
            try:
                _calibration[k] = int(v)
            except Exception:
                pass
    if any(k in data for k in list(float_keys) + list(int_keys)):
        _calibration_profile = 'manual'
    return get_calibration()


def _apply_startup_calibration_profile():
    global _calibration_profile
    profile = str(getattr(Config, 'RECOG_CALIBRATION_PROFILE', 'classroom_mid')).strip()
    if profile not in _calibration_profiles:
        profile = 'classroom_mid'

    # Auto-select by distance/fov if profile not explicitly trusted.
    distance_m = float(getattr(Config, 'CAMERA_DISTANCE_M', 10.0))
    fov_deg = float(getattr(Config, 'CAMERA_FOV_DEG', 78.0))
    if distance_m >= 15.0:
        profile = 'classroom_far'
    elif distance_m <= 6.0 and fov_deg <= 75.0:
        profile = 'classroom_near'
    elif profile not in _calibration_profiles:
        profile = 'classroom_mid'

    _calibration.update(_calibration_profiles.get(profile, _calibration_profiles['classroom_mid']))
    _calibration_profile = profile
    logger.info(f"[Calib] startup profile={profile}, distance={distance_m}m, fov={fov_deg}deg")


def _update_behavior_context(track_id, state, face_bbox, person_bbox, image_bgr, now_ts, pose_flags=None):
    tracks = _state_tracker['tracks']
    tr = tracks.get(track_id)
    if tr is None:
        return {
            'behavior': 'normal',
            'headDownDurationSec': 0.0,
            'writingActive': False,
            'handRaised': False,
            'sleepingOnDesk': False,
            'concentrationTag': 'medium'
        }
    if 'behavior' not in tr:
        tr['behavior'] = {
            'down_start': None,
            'writing_ema': 0.0,
            'upper_motion_ema': 0.0,
            'prev_write_gray': None,
            'prev_upper_gray': None,
            'last_seen': now_ts,
        }
    b = tr['behavior']
    b['last_seen'] = now_ts

    px, py, pw, ph = person_bbox if person_bbox is not None else face_bbox
    px = max(0, int(px)); py = max(0, int(py)); pw = max(1, int(pw)); ph = max(1, int(ph))
    ih, iw = image_bgr.shape[:2]
    px2 = min(iw, px + pw); py2 = min(ih, py + ph)
    if px2 <= px or py2 <= py:
        px, py, pw, ph = face_bbox
        px2 = min(iw, px + pw); py2 = min(ih, py + ph)

    upper_roi = image_bgr[py:py + max(1, int((py2 - py) * 0.35)), px:px2]
    write_y1 = py + int((py2 - py) * 0.55)
    write_roi = image_bgr[write_y1:py2, px:px2]
    upper_gray = cv2.cvtColor(upper_roi, cv2.COLOR_BGR2GRAY) if upper_roi.size > 0 else None
    write_gray = cv2.cvtColor(write_roi, cv2.COLOR_BGR2GRAY) if write_roi.size > 0 else None
    if upper_gray is not None:
        upper_gray = cv2.GaussianBlur(upper_gray, (5, 5), 0)
    if write_gray is not None:
        write_gray = cv2.GaussianBlur(write_gray, (5, 5), 0)

    write_motion = _compute_motion_score(write_gray, b.get('prev_write_gray'))
    upper_motion = _compute_motion_score(upper_gray, b.get('prev_upper_gray'))
    b['prev_write_gray'] = write_gray
    b['prev_upper_gray'] = upper_gray
    b['writing_ema'] = b.get('writing_ema', 0.0) * 0.72 + write_motion * 0.28
    b['upper_motion_ema'] = b.get('upper_motion_ema', 0.0) * 0.75 + upper_motion * 0.25

    if state == 'head_down':
        if b.get('down_start') is None:
            b['down_start'] = now_ts
    else:
        b['down_start'] = None

    down_duration = (now_ts - b['down_start']) if b.get('down_start') is not None else 0.0
    writing_active = b['writing_ema'] >= 0.038
    hand_raised_motion = (state in ('head_up', 'looking_forward')) and (b['upper_motion_ema'] >= 0.048)

    fx, fy, fw, fh = face_bbox
    rel_face_h = fh / float(max(1, ph))
    rel_face_y = (fy + fh / 2.0 - py) / float(max(1, ph))
    pose_flags = pose_flags or {}
    sleeping_on_desk = (state == 'head_down' and rel_face_h < 0.24 and rel_face_y > 0.6 and not writing_active)
    if pose_flags.get('headDownPose', False) and not writing_active and rel_face_y > 0.56:
        sleeping_on_desk = True

    hand_raised = bool(hand_raised_motion or pose_flags.get('handRaised', False))

    if down_duration >= 30.0:
        if sleeping_on_desk and not writing_active:
            concentration_tag = 'low'
            behavior = 'sleep_like_head_down'
        elif writing_active:
            concentration_tag = 'high'
            behavior = 'focused_writing_head_down'
        else:
            concentration_tag = 'medium'
            behavior = 'long_head_down_reading'
    else:
        concentration_tag = 'high' if writing_active else ('medium' if state != 'head_down' else 'low')
        behavior = 'normal'

    return {
        'behavior': behavior,
        'headDownDurationSec': round(down_duration, 1),
        'writingActive': bool(writing_active),
        'handRaised': bool(hand_raised),
        'sleepingOnDesk': bool(sleeping_on_desk),
        'concentrationTag': concentration_tag,
        'poseFlags': pose_flags
    }


def _init_dnn_face_detector():
    global _dnn_face_net, _dnn_ready
    if _dnn_ready and _dnn_face_net is not None:
        return True

    backend_dir = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
    project_dir = os.path.dirname(backend_dir)
    candidates = [
        (
            os.path.join(project_dir, 'open-cv-learning-code', 'model', 'opencv_face_detector.pbtxt'),
            os.path.join(project_dir, 'open-cv-learning-code', 'model', 'opencv_face_detector_uint8.pb'),
        ),
        (
            os.path.join(project_dir, 'open-cv-learning-code', '源代码', 'opencv', '机器学习', 'model', 'opencv_face_detector.pbtxt'),
            os.path.join(project_dir, 'open-cv-learning-code', '源代码', 'opencv', '机器学习', 'model', 'opencv_face_detector_uint8.pb'),
        ),
    ]

    for pbtxt, pb in candidates:
        if os.path.exists(pbtxt) and os.path.exists(pb):
            try:
                import shutil
                import tempfile
                temp_dir = tempfile.gettempdir()
                tmp_pbtxt = os.path.join(temp_dir, 'face_detector.pbtxt')
                tmp_pb = os.path.join(temp_dir, 'face_detector.pb')
                shutil.copy2(pbtxt, tmp_pbtxt)
                shutil.copy2(pb, tmp_pb)
                _dnn_face_net = cv2.dnn.readNet(tmp_pb, tmp_pbtxt)
                _dnn_ready = True
                logger.info("[Init] ✅ DNN 人脸检测器初始化成功")
                return True
            except Exception as e:
                logger.warning(f"[Init] DNN 初始化失败: {e}")

    _dnn_ready = False
    return False


def _detect_faces_dnn(image_bgr, conf_threshold=0.55):
    if not _dnn_ready or _dnn_face_net is None:
        return []

    h, w = image_bgr.shape[:2]
    blob = cv2.dnn.blobFromImage(image_bgr, 1.0, (300, 300), (104.0, 177.0, 123.0))
    _dnn_face_net.setInput(blob)
    detections = _dnn_face_net.forward()

    boxes = []
    for i in range(detections.shape[2]):
        conf = float(detections[0, 0, i, 2])
        if conf < conf_threshold:
            continue
        x1 = int(detections[0, 0, i, 3] * w)
        y1 = int(detections[0, 0, i, 4] * h)
        x2 = int(detections[0, 0, i, 5] * w)
        y2 = int(detections[0, 0, i, 6] * h)
        x1 = max(0, min(x1, w - 1))
        y1 = max(0, min(y1, h - 1))
        x2 = max(0, min(x2, w))
        y2 = max(0, min(y2, h))
        bw = max(0, x2 - x1)
        bh = max(0, y2 - y1)
        if bw > 0 and bh > 0:
            boxes.append((x1, y1, bw, bh))
    return boxes


def _detect_faces_robust(image_bgr):
    gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)

    h, w = enhanced.shape[:2]
    detect_scale = 1.0
    if w > 960:
        detect_scale = 0.65
    elif w > 640:
        detect_scale = 0.8

    work = enhanced
    if detect_scale < 1.0:
        work = cv2.resize(enhanced, (int(w * detect_scale), int(h * detect_scale)))

    raw = _cascade_face.detectMultiScale(
        work,
        scaleFactor=1.08,
        minNeighbors=6,
        minSize=(28, 28),
        flags=cv2.CASCADE_SCALE_IMAGE
    )
    boxes = [tuple(map(int, b)) for b in raw] if len(raw) > 0 else []

    if detect_scale < 1.0 and boxes:
        inv = 1.0 / detect_scale
        boxes = [(int(x * inv), int(y * inv), int(wb * inv), int(hb * inv)) for (x, y, wb, hb) in boxes]

    boxes = _stabilize_face_boxes(boxes, image_bgr.shape)
    if len(boxes) == 0 or len(boxes) >= 4:
        dnn_boxes = _detect_faces_dnn(image_bgr, conf_threshold=0.55)
        dnn_boxes = _stabilize_face_boxes(dnn_boxes, image_bgr.shape)
        if dnn_boxes:
            boxes = dnn_boxes
    return boxes


def _init_cascades():
    global _cascade_face, _cascade_eye, _cascade_profile, _init_status
    
    if _init_status and _cascade_face is not None:
        return True
    
    import os, shutil, tempfile
    
    def _load(path):
        c = cv2.CascadeClassifier(path)
        return c if not c.empty() else None
    
    temp_dir = tempfile.gettempdir()
    
    face_path = os.path.join(temp_dir, 'hc_face.xml')
    if os.path.exists(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml'):
        shutil.copy2(cv2.data.haarcascades + 'haarcascade_frontalface_default.xml', face_path)
    _cascade_face = _load(face_path)
    
    eye_path = os.path.join(temp_dir, 'hc_eye.xml')
    if os.path.exists(cv2.data.haarcascades + 'haarcascade_eye.xml'):
        shutil.copy2(cv2.data.haarcascades + 'haarcascade_eye.xml', eye_path)
    _cascade_eye = _load(eye_path)
    
    profile_path = os.path.join(temp_dir, 'hc_profile.xml')
    if os.path.exists(cv2.data.haarcascades + 'haarcascade_profileface.xml'):
        shutil.copy2(cv2.data.haarcascades + 'haarcascade_profileface.xml', profile_path)
    _cascade_profile = _load(profile_path)
    
    _init_status = (_cascade_face is not None)
    _init_dnn_face_detector()
    
    if _init_status:
        logger.info("[Init] ✅ 人脸检测器初始化成功")
    else:
        logger.error("[Init] ❌ 人脸检测器初始化失败")
    
    return _init_status


def _decode_image(base64_str: str):
    try:
        if ',' in base64_str:
            base64_str = base64_str.split(',')[1]
        img_bytes = base64.b64decode(base64_str)
        nparr = np.frombuffer(img_bytes, np.uint8)
        image = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        
        if image is None or image.size == 0:
            return None
        
        return image
    except Exception as e:
        logger.error(f"[Decode] 异常: {e}")
        return None


def detect_faces(image_data: str) -> list:
    """检测图像中的人脸"""
    
    image = _decode_image(image_data)
    if image is None:
        return []
    
    if not _init_cascades():
        return []
    
    faces = _detect_faces_robust(image)
    
    result = []
    for (x, y, w, h) in faces:
        confidence = min(0.95, 0.7 + (w * h) / (image.shape[0] * image.shape[1]) * 5)
        result.append({
            'x': int(x),
            'y': int(y),
            'width': int(w),
            'height': int(h),
            'confidence': round(confidence, 4)
        })
    
    return result


def extract_face_features(image_data: str) -> list:
    """提取人脸特征（用于录入）"""
    
    image = _decode_image(image_data)
    if image is None:
        return None
    
    if not _init_cascades():
        return None
    
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    
    faces = _cascade_face.detectMultiScale(
        enhanced,
        scaleFactor=1.05,
        minNeighbors=4,
        minSize=(35, 35)
    )
    
    if len(faces) == 0:
        return None
    
    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
    
    pad_w = int(w * 0.2)
    pad_h = int(h * 0.2)
    
    x1 = max(0, x - pad_w)
    y1 = max(0, y - pad_h)
    x2 = min(gray.shape[1], x + w + pad_w)
    y2 = min(gray.shape[0], y + h + pad_h)
    
    face_roi = gray[y1:y2, x1:x2]
    
    face_resized = cv2.resize(face_roi, (128, 128))
    
    lbp = _compute_lbp(face_resized)
    
    num_bins = 59
    cell_size = 16
    h, w = lbp.shape
    features = []
    
    for row in range(0, h - cell_size + 1, cell_size):
        for col in range(0, w - cell_size + 1, cell_size):
            cell = lbp[row:row+cell_size, col:col+cell_size]
            hist, _ = np.histogram(cell.ravel(), bins=num_bins, range=(0, num_bins+1))
            hist = hist.astype(np.float64)
            hist_sum = hist.sum()
            if hist_sum > 0:
                hist = hist / hist_sum
            features.extend(hist.tolist())
    
    target_dim = Config.FACE_EMBEDDING_DIMENSION
    if len(features) > target_dim:
        features = features[:target_dim]
    elif len(features) < target_dim:
        features.extend([0.0] * (target_dim - len(features)))
    
    features = _normalize_vector(features)
    # Fuse face texture feature with upper-body appearance feature to reduce wrong-person mismatch.
    context_vec = _extract_identity_context_feature(image, (x, y, w, h), target_dim)
    fused = []
    for i in range(target_dim):
        fv = features[i] if i < len(features) else 0.0
        cv = context_vec[i] if i < len(context_vec) else 0.0
        fused.append(0.84 * fv + 0.16 * cv)
    fused = _normalize_vector(fused)
    return [round(float(v), 6) for v in fused]


def extract_face_features_with_meta(image_data: str) -> dict:
    image = _decode_image(image_data)
    if image is None:
        return {'ok': False, 'error': 'decode_failed'}
    if not _init_cascades():
        return {'ok': False, 'error': 'cascade_not_ready'}

    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
    enhanced = clahe.apply(gray)
    faces = _cascade_face.detectMultiScale(
        enhanced,
        scaleFactor=1.05,
        minNeighbors=4,
        minSize=(35, 35)
    )
    if len(faces) == 0:
        return {'ok': False, 'error': 'no_face'}
    x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
    pad_w = int(w * 0.2)
    pad_h = int(h * 0.2)
    x1 = max(0, x - pad_w)
    y1 = max(0, y - pad_h)
    x2 = min(gray.shape[1], x + w + pad_w)
    y2 = min(gray.shape[0], y + h + pad_h)
    face_roi = gray[y1:y2, x1:x2]

    q = _evaluate_face_roi_quality(face_roi, image.shape, (x, y, w, h))
    feat = extract_face_features(image_data)
    if feat is None:
        return {'ok': False, 'error': 'feature_failed', 'quality': q}
    return {
        'ok': q['ok'],
        'features': feat,
        'quality': q,
        'faceBox': [int(x), int(y), int(w), int(h)]
    }


def extract_face_features_from_roi(face_roi) -> list:
    """
    从已裁剪的人脸 ROI 直接提取特征（不再做级联检测）。
    用于实时监控：避免在裁剪图上二次 detect 导致特征提取失败。
    """
    if face_roi is None or getattr(face_roi, "size", 0) == 0:
        return None

    if len(face_roi.shape) == 3:
        gray = cv2.cvtColor(face_roi, cv2.COLOR_BGR2GRAY)
    else:
        gray = face_roi

    # 与 extract_face_features 保持一致：直接 resize -> LBP -> hist 拼接 -> 归一化
    face_resized = cv2.resize(gray, (128, 128))
    lbp = _compute_lbp(face_resized)

    num_bins = 59
    cell_size = 16
    h, w = lbp.shape
    features = []

    for row in range(0, h - cell_size + 1, cell_size):
        for col in range(0, w - cell_size + 1, cell_size):
            cell = lbp[row : row + cell_size, col : col + cell_size]
            hist, _ = np.histogram(cell.ravel(), bins=num_bins, range=(0, num_bins + 1))
            hist = hist.astype(np.float64)
            hist_sum = hist.sum()
            if hist_sum > 0:
                hist = hist / hist_sum
            features.extend(hist.tolist())

    target_dim = Config.FACE_EMBEDDING_DIMENSION
    if len(features) > target_dim:
        features = features[:target_dim]
    elif len(features) < target_dim:
        features.extend([0.0] * (target_dim - len(features)))

    total = sum(features)
    if total > 0:
        features = [f / total for f in features]

    return [round(float(x), 6) for x in features]


def _compute_lbp(gray_img):
    h, w = gray_img.shape
    lbp = np.zeros_like(gray_img, dtype=np.uint8)
    
    offsets = [(-1, -1), (0, -1), (1, -1),
               (-1,  0),          (1,  0),
               (-1,  1), (0,  1), (1,  1)]
    
    uniform_patterns = {
        0, 1, 2, 3, 4, 6, 7, 8, 12, 14, 15, 16, 24, 28, 30, 31,
        32, 48, 56, 60, 63, 64, 96, 112, 120, 126, 127, 128, 129,
        131, 135, 143, 159, 191, 192, 193, 195, 199, 207, 223, 224,
        225, 227, 231, 239, 240, 241, 243, 247, 248, 249, 251, 252,
        253, 254, 255
    }
    uniform_map = {}
    next_val = 0
    for p in sorted(uniform_patterns):
        uniform_map[p] = next_val
        next_val += 1
    
    for y in range(1, h - 1):
        for x in range(1, w - 1):
            center = gray_img[y, x]
            code = 0
            for i, (dy, dx) in enumerate(offsets):
                if gray_img[y + dy, x + dx] >= center:
                    code |= (1 << i)
            lbp[y, x] = uniform_map.get(code, 58)
    
    return lbp


def recognize_face(image_data: str, known_features_list: list) -> dict:
    """识别人脸身份"""
    
    current_features = extract_face_features(image_data)
    if current_features is None:
        return {'matched': False, 'error': '未检测到人脸'}

    return recognize_face_from_features(current_features, known_features_list)


def analyze_attention_state(face_region, full_image=None, face_box=None) -> dict:
    """
    分析人物的专注状态
    返回: 状态类型、专注度分数、详细分析
    """
    
    if len(face_region.shape) == 3:
        gray = cv2.cvtColor(face_region, cv2.COLOR_BGR2GRAY)
    else:
        gray = face_region.copy()
    
    h, w = gray.shape[:2]
    
    blur_val = cv2.Laplacian(gray, cv2.CV_64F).var()
    mean_intensity = np.mean(gray)
    
    aspect_ratio = w / float(h) if h > 0 else 1.0
    eye_count = 0
    if _cascade_eye is not None and h > 30 and w > 30:
        upper = gray[0:int(h * 0.6), :]
        eyes = _cascade_eye.detectMultiScale(
            upper,
            scaleFactor=1.12,
            minNeighbors=4,
            minSize=(10, 10)
        )
        eye_count = len(eyes)
    
    state_type = 'looking_forward'
    attention_score = 8.5
    details = {}
    
    if eye_count == 0 and blur_val < 180:
        state_type = 'eyes_closed_both'
        attention_score = 1.5
        details['reason'] = '双眼闭合'
    elif eye_count == 1 and blur_val < 220:
        state_type = 'eyes_closed_single'
        attention_score = 3.5
        details['reason'] = '单眼闭合'
    elif blur_val > 300:
        state_type = 'frowning'
        attention_score = 4.0
        details['reason'] = '皱眉'
    elif aspect_ratio > 1.35:
        state_type = 'mouth_open'
        attention_score = 6.0
        details['reason'] = '张嘴'
    elif aspect_ratio < 0.70:
        state_type = 'head_down'
        attention_score = 1.5
        details['reason'] = '低头'
    elif mean_intensity < 80:
        state_type = 'low_light'
        attention_score = 5.0
        details['reason'] = '光线不足'
    else:
        if full_image is not None and face_box is not None:
            img_h, img_w = full_image.shape[:2]
            face_x = face_box.get('x', 0)
            face_y = face_box.get('y', 0)
            face_w = face_box.get('width', 0)
            face_h = face_box.get('height', 0)
            
            vertical_ratio = (face_y + face_h / 2) / img_h if img_h > 0 else 0.5
            
            horizontal_center = face_x + face_w / 2
            img_center_x = img_w / 2
            horizontal_offset = abs(horizontal_center - img_center_x) / (img_w / 2) if img_w > 0 else 0
            
            if vertical_ratio > 0.72:
                state_type = 'head_down'
                attention_score = 2.0
                details['reason'] = '低头严重'
            elif vertical_ratio < 0.28:
                state_type = 'head_up'
                attention_score = 6.0
                details['reason'] = '抬头偏高'
            elif horizontal_offset > 0.30:
                if horizontal_center < img_center_x:
                    state_type = 'looking_left'
                    attention_score = 5.5
                    details['reason'] = '向左看'
                else:
                    state_type = 'looking_right'
                    attention_score = 5.5
                    details['reason'] = '向右看'
            else:
                state_type = 'looking_forward'
                attention_score = 9.0
                details['reason'] = '正常注视前方'
        else:
            state_type = 'looking_forward'
            attention_score = 9.0
            details['reason'] = '正常'
    
    return {
        'state': state_type,
        'attentionScore': round(attention_score, 2),
        'details': details,
        'blurValue': round(blur_val, 2),
        'aspectRatio': round(aspect_ratio, 3),
        'intensity': round(mean_intensity, 1),
        'eyeCount': int(eye_count),
        'eyeStatus': 'both_closed' if state_type == 'eyes_closed_both' else ('single_closed' if state_type == 'eyes_closed_single' else 'open'),
    }


def process_frame_for_monitoring(image_base64: str, students_data: list = None) -> dict:
    """
    处理监控帧 - 完整的人物识别与状态分析
    返回每个检测到的人物的: 姓名、状态、专注度、跟踪框
    """

    frame_start = time.perf_counter()

    default_stats = {
        'headDownRate': 0.0,
        'headUpRate': 0.0,
        'eyesClosedRate': 0.0,
        'turningHeadRate': 0.0,
        'classroomStats': {
            'windowSec': _classroom_stats_window.get('window_sec', 5.0),
            'headDownRate': 0.0,
            'headUpRate': 0.0,
            'eyesClosedRate': 0.0,
            'turningHeadRate': 0.0,
            'sampleCount': 0,
        },
    }

    image = _decode_image(image_base64)
    if image is None:
        return {
            'faces': [],
            'totalFaces': 0,
            'avgAttentionScore': 0,
            'error': '无法解码图像',
            'processingTimeMs': 0,
            **default_stats
        }

    if not _init_cascades():
        logger.warning("[Monitor] 级联分类器未初始化，尝试重新初始化...")
        if not _init_cascades():
            logger.error("[Monitor] 级联分类器初始化失败，无法进行人脸检测")
            return {
                'faces': [],
                'totalFaces': 0,
                'avgAttentionScore': 0,
                'error': '级联分类器未初始化',
                'processingTimeMs': round((time.perf_counter() - frame_start) * 1000, 1),
                **default_stats
            }

    scene_info = _analyze_scene_with_yolo(image)
    pose_info = _analyze_pose_keypoints(image)
    scene_persons = _merge_person_pose(scene_info.get('persons', []), pose_info.get('persons', []))
    faces_raw = _detect_faces_robust(image)
    faces_raw = _apply_temporal_single_person_stabilization(faces_raw)

    logger.info(f"[Monitor] 检测到 {len(faces_raw)} 个人脸区域，图像尺寸: {image.shape[1]}x{image.shape[0]}")

    faces = []
    for (x, y, w, h) in faces_raw:
        confidence = min(0.95, 0.7 + (w * h) / (image.shape[0] * image.shape[1]) * 5)
        faces.append({
            'x': int(x), 'y': int(y), 'width': int(w), 'height': int(h),
            'confidence': round(confidence, 4)
        })
    
    known_features_list = []
    known_students_info = []
    
    if students_data:
        valid_ids = set()
        for stu in students_data:
            feat = stu.get('face_features')
            if not feat:
                continue
            if isinstance(feat, bytes):
                try:
                    feat = feat.decode('utf-8')
                except Exception:
                    continue
            if isinstance(feat, str) and feat.strip():
                sid = str(stu.get('id', ''))
                if sid:
                    valid_ids.add(sid)
                known_features_list.append(feat)
                known_students_info.append({
                    'id': sid,
                    'name': stu.get('real_name', ''),
                    'student_number': stu.get('student_number', '')
                })
        # Prevent stale cross-class identity contamination.
        if len(valid_ids) > 0:
            for sid in list(_student_reid_bank.keys()):
                if sid not in valid_ids:
                    _student_reid_bank.pop(sid, None)
            for sid in list(_student_spatial_anchor.keys()):
                if sid not in valid_ids:
                    _student_spatial_anchor.pop(sid, None)
    
    results = []
    total_attention = 0
    high_count = medium_count = low_count = 0
    hand_raise_count = 0
    writing_count = 0
    long_head_down_count = 0
    
    now_ts = time.perf_counter()
    for face_box in faces:
        x, y, w, h = face_box['x'], face_box['y'], face_box['width'], face_box['height']
        pad_w = int(w * 0.2)
        pad_h = int(h * 0.2)
        x1, y1 = max(0, x), max(0, y)
        x2, y2 = min(image.shape[1], x+w), min(image.shape[0], y+h)
        
        face_region = image[y1:y2, x1:x2]
        if face_region.size == 0:
            continue
        face_gray_q = cv2.cvtColor(face_region, cv2.COLOR_BGR2GRAY) if len(face_region.shape) == 3 else face_region
        face_blur = float(cv2.Laplacian(face_gray_q, cv2.CV_64F).var()) if face_gray_q.size > 0 else 0.0
        face_area_ratio = float((w * h) / max(1.0, image.shape[0] * image.shape[1]))
        allow_identity_match = (
            face_blur >= float(_calibration.get('min_face_blur', 65.0)) and
            face_area_ratio >= float(_calibration.get('min_face_area_ratio', 0.0045))
        )
        
        attention_result = analyze_attention_state(face_region, image, face_box)
        attention_score = attention_result['attentionScore']
        state = attention_result['state']
        stable = _stabilize_face_state(
            (x, y, w, h),
            state,
            attention_score,
            attention_result.get('eyeStatus', 'open'),
            now_ts
        )
        sx, sy, sw, sh = stable['bbox']
        state = stable['state']
        attention_score = stable['attention_score']
        person_match = _find_person_for_face((sx, sy, sw, sh), scene_persons)
        pose_flags = _pose_behavior_flags(
            person_match['bbox'] if person_match else (sx, sy, sw, sh),
            person_match.get('keypoints', []) if person_match else []
        )
        behavior_ctx = _update_behavior_context(
            stable.get('track_id'),
            state,
            (sx, sy, sw, sh),
            person_match['bbox'] if person_match else None,
            image,
            now_ts,
            pose_flags=pose_flags
        )
        if behavior_ctx.get('handRaised'):
            hand_raise_count += 1
        if behavior_ctx.get('writingActive'):
            writing_count += 1
        if behavior_ctx.get('headDownDurationSec', 0.0) >= 30:
            long_head_down_count += 1
        
        if attention_score >= 7.0:
            level = 'high'
            high_count += 1
        elif attention_score >= 4.0:
            level = 'medium'
            medium_count += 1
        else:
            level = 'low'
            low_count += 1
        
        total_attention += attention_score
        
        student_info = None
        is_registered = False
        track_id = stable.get('track_id')
        candidate_student = None
        candidate_conf = 0.0
        
        face_recog_id = None
        reid_id = None
        if known_features_list and allow_identity_match:
            # 为比对提取特征时加入 padding，减少裁剪过紧导致的特征偏移
            rx1 = max(0, x - pad_w)
            ry1 = max(0, y - pad_h)
            rx2 = min(image.shape[1], x + w + pad_w)
            ry2 = min(image.shape[0], y + h + pad_h)

            recog_roi = image[ry1:ry2, rx1:rx2]
            current_features = extract_face_features_from_roi(recog_roi)
            recog_result = recognize_face_from_features(current_features, known_features_list)
            
            if recog_result.get('matched') and recog_result.get('matchIndex', -1) >= 0:
                mi = recog_result['matchIndex']
                if mi < len(known_students_info):
                    candidate_student = known_students_info[mi]
                    candidate_conf = float(recog_result.get('confidence', 0.0))
                    face_recog_id = str(candidate_student.get('id', ''))
                    tr = _state_tracker['tracks'].get(track_id) if track_id is not None else None
                    if tr is not None and candidate_conf >= float(_calibration.get('live_face_conf_gate', 0.18)):
                        tr['identity_cache'] = {
                            'student': candidate_student,
                            'ts': now_ts,
                            'distance': recog_result.get('distance'),
                            'confidence': recog_result.get('confidence', 0.0),
                        }
                        if person_match is not None and candidate_conf >= float(_calibration.get('reid_update_min_conf', 0.18)):
                            tr['reid_embedding'] = _extract_reid_embedding(image, person_match['bbox'])
                            _update_student_reid_bank(candidate_student['id'], tr['reid_embedding'])

        if track_id is not None:
            tr = _state_tracker['tracks'].get(track_id)
            cache = tr.get('identity_cache') if tr else None
            cache_keep_sec = float(_calibration.get('cache_keep_sec', 4.5))
            if candidate_student is None and cache and (now_ts - cache.get('ts', 0.0)) <= cache_keep_sec:
                candidate_student = cache.get('student')
                candidate_conf = max(candidate_conf, float(cache.get('confidence', 0.0)))
            if candidate_student is None and person_match is not None:
                reid_vec = _extract_reid_embedding(image, person_match['bbox'])
                reid_hit = _match_student_by_reid(reid_vec)
                if reid_hit:
                    sid = str(reid_hit['studentId'])
                    reid_id = sid
                    for info in known_students_info:
                        if str(info.get('id')) == sid:
                            candidate_student = info
                            candidate_conf = max(candidate_conf, float(reid_hit.get('similarity', 0.0)) * 0.6)
                            break
                    if candidate_student is not None and tr is not None:
                        tr['identity_cache'] = {
                            'student': candidate_student,
                            'ts': now_ts,
                            'distance': None,
                            'confidence': min(0.92, reid_hit['similarity']),
                        }
            if (
                int(_calibration.get('face_reid_consistency_required', 1)) == 1
                and face_recog_id is not None
                and reid_id is not None
                and face_recog_id != reid_id
            ):
                candidate_student = None
                candidate_conf = 0.0
            student_info = _stabilize_identity_for_track(
                track_id,
                candidate_student,
                candidate_conf,
                now_ts,
                face_bbox=(sx, sy, sw, sh),
                image_shape=image.shape,
                current_state=state
            )
            is_registered = student_info is not None
        else:
            student_info = candidate_student
            is_registered = student_info is not None
        
        if is_registered and student_info:
            matched_student = {
                'id': student_info['id'],
                'name': student_info['name'],
                'student_number': student_info['student_number']
            }
        else:
            matched_student = None

        expression_map = {
            'looking_forward': 'neutral',
            'looking_left': 'neutral',
            'looking_right': 'neutral',
            'head_down': 'sad',
            'head_up': 'neutral',
            'eyes_closed_both': 'sleepy',
            'eyes_closed_single': 'sleepy',
            'talking': 'happy',
        }
        posture_map = {
            'looking_forward': 'sitting_upright',
            'looking_left': 'turning_head',
            'looking_right': 'turning_head',
            'head_down': 'slouching',
            'head_up': 'leaning_back',
            'eyes_closed_both': 'sitting_upright',
            'eyes_closed_single': 'sitting_upright',
            'talking': 'sitting_upright',
        }

        results.append({
            'bbox': [int(sx), int(sy), int(sw), int(sh)],
            'confidence': round(face_box.get('confidence', 0.85), 3),
            'attention_score': round(attention_score, 2),
            'attention_level': level,
            'state_type': state,
            'eye_status': stable.get('eye_status', attention_result.get('eyeStatus', 'open')),
            'eye_count': attention_result.get('eyeCount', 0),
            'track_id': stable.get('track_id'),
            'expression_type': expression_map.get(state, 'neutral'),
            'posture_type': posture_map.get(state, 'sitting_upright'),
            'matched_student': matched_student,
            'behavior': behavior_ctx,
            'person_bbox': person_match['bbox'] if person_match else None,
            'pose_keypoints': person_match.get('keypoints', []) if person_match else [],
            'identity_quality': {
                'allow_match': bool(allow_identity_match),
                'face_blur': round(face_blur, 2),
                'face_area_ratio': round(face_area_ratio, 6),
            }
        })
    
    total = len(results) if results else 1
    elapsed_ms = (time.perf_counter() - frame_start) * 1000
    frame_rates = _compute_frame_classroom_rates(results)
    classroom_stats = _update_classroom_stats_window(frame_rates, now_ts)
    down_up_ratio = round(
        frame_rates['head_down_rate'] / max(1.0, frame_rates['head_up_rate']),
        3
    )
    
    return {
        'faces': results,
        'totalFaces': len(results),
        'avgAttentionScore': round(total_attention / total, 2) if results else 0,
        'highAttentionRate': round(high_count / total * 100, 1) if results else 0,
        'mediumAttentionRate': round(medium_count / total * 100, 1) if results else 0,
        'lowAttentionRate': round(low_count / total * 100, 1) if results else 0,
        'headDownRate': frame_rates['head_down_rate'],
        'headUpRate': frame_rates['head_up_rate'],
        'eyesClosedRate': frame_rates['eyes_closed_rate'],
        'turningHeadRate': frame_rates['turning_head_rate'],
        'classroomStats': classroom_stats,
        'headDownHeadUpRatio': down_up_ratio,
        'handRaiseRate': round(hand_raise_count / total * 100, 1) if results else 0.0,
        'writingRate': round(writing_count / total * 100, 1) if results else 0.0,
        'longHeadDownRate': round(long_head_down_count / total * 100, 1) if results else 0.0,
        'yoloReady': bool(scene_info.get('ready', False)),
        'poseReady': bool(pose_info.get('ready', False)),
        'personDetections': len(scene_persons),
        'processingTimeMs': round(elapsed_ms, 1)
    }


def recognize_face_from_features(current_features, known_features_list: list) -> dict:
    """
    使用已提取的人脸特征向量进行比对（不再触发级联检测）。
    """
    if current_features is None:
        return {'matched': False, 'error': '未检测到人脸'}

    best_match = -1
    best_distance = float('inf')
    second_distance = float('inf')

    for idx, known in enumerate(known_features_list):
        if isinstance(known, bytes):
            try:
                known = known.decode('utf-8')
            except Exception:
                continue

        if isinstance(known, str):
            try:
                known_vec = [float(x) for x in known.split(',') if x != '']
            except ValueError:
                continue
        elif isinstance(known, (list, np.ndarray)):
            known_vec = list(known)
        else:
            continue

        min_len = min(len(current_features), len(known_vec))
        dist = float(
            np.linalg.norm(
                np.array(current_features[:min_len]) - np.array(known_vec[:min_len])
            )
        )

        if dist < best_distance:
            second_distance = best_distance
            best_distance = dist
            best_match = idx
        elif dist < second_distance:
            second_distance = dist

    threshold = Config.FACE_RECOGNITION_THRESHOLD
    margin = second_distance - best_distance if second_distance < float('inf') else 1.0
    # Stricter anti-misrecognition: require both threshold pass and enough gap from second-best.
    min_margin = max(0.035, threshold * 0.08)
    min_confidence = float(_calibration.get('min_match_confidence', 0.06))
    min_margin = max(min_margin, float(_calibration.get('min_match_margin', 0.045)))
    matched = (best_distance < threshold) and (margin >= min_margin)

    if matched:
        confidence = round(max(0, (threshold - best_distance) / threshold), 4)
        if confidence < min_confidence:
            matched = False
            confidence = 0.0
    else:
        confidence = 0.0

    return {
        'matched': matched,
        'matchIndex': best_match if matched else -1,
        'distance': round(best_distance, 6),
        'secondDistance': round(second_distance, 6) if second_distance < float('inf') else None,
        'distanceMargin': round(margin, 6),
        'confidence': confidence,
        'features': current_features,
    }


def get_performance_stats():
    return {
        'cascade_initialized': _init_status,
        'yolo_ready': _yolo_ready,
        'status': 'ready' if _init_status else 'not_initialized'
    }


_apply_startup_calibration_profile()

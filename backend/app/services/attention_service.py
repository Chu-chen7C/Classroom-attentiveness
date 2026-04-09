from app.config import Config

EXPRESSION_SCORES = {
    'forward': 9.0,
    'smile': 8.5,
    'mouth_open': 6.0,
    'frown': 3.0,
    'eyes_closed': 2.0,
    'head_down': 1.0
}

POSTURE_SCORES = {
    'forward_sitting': 9.0,
    'turn_side': 6.0,
    'obvious_side': 3.0,
    'lie_on_desk': 1.0
}

LEVEL_MAP = {
    'high': (Config.HIGH_ATTENTION_MIN, 10),
    'medium': (Config.MEDIUM_ATTENTION_MIN, Config.HIGH_ATTENTION_MIN - 0.01),
    'low': (0, Config.MEDIUM_ATTENTION_MIN - 0.01)
}


def calculate_attention_score(expression_type: str, posture_type: str) -> tuple:
    expr_score = EXPRESSION_SCORES.get(expression_type, 5.0)
    post_score = POSTURE_SCORES.get(posture_type, 5.0)

    final_score = (
        Config.EXPRESSION_WEIGHT * expr_score +
        Config.POSTURE_WEIGHT * post_score
    )

    final_score = max(0, min(10, final_score))
    level = _get_level(final_score)

    return round(final_score, 2), level


def _get_level(score: float) -> str:
    if score >= Config.HIGH_ATTENTION_MIN:
        return 'high'
    elif score >= Config.MEDIUM_ATTENTION_MIN:
        return 'medium'
    else:
        return 'low'


def get_class_attention_summary(records: list) -> dict:
    if not records:
        return {
            'totalStudents': 0,
            'avgScore': 0,
            'highRate': 0,
            'mediumRate': 0,
            'lowRate': 0,
            'highCount': 0,
            'mediumCount': 0,
            'lowCount': 0
        }

    total = len(records)
    scores = [r.get('score', 0) for r in records]

    high_count = sum(1 for s in scores if s >= Config.HIGH_ATTENTION_MIN)
    medium_count = sum(1 for s in scores if Config.MEDIUM_ATTENTION_MIN <= s < Config.HIGH_ATTENTION_MIN)
    low_count = total - high_count - medium_count

    return {
        'totalStudents': total,
        'avgScore': round(sum(scores) / total, 2),
        'highRate': round(high_count / total * 100, 2),
        'mediumRate': round(medium_count / total * 100, 2),
        'lowRate': round(low_count / total * 100, 2),
        'highCount': high_count,
        'mediumCount': medium_count,
        'lowCount': low_count
    }

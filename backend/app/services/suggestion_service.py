from datetime import datetime
from typing import List, Dict
from app.config import Config
from app.services.attention_service import LEVEL_MAP

SUGGESTION_RULES = [
    {
        'type': 'targeted_question',
        'title': '针对性提问',
        'description': '对注意力不集中的学生进行提问，引导其回归课堂',
        'duration': 3,
        'priority': 'P1',
        'condition': lambda stats: stats.get('lowRate', 0) >= 30,
        'materials': ''
    },
    {
        'type': 'group_discussion',
        'title': '小组讨论',
        'description': '组织学生进行小组讨论，活跃课堂气氛',
        'duration': 10,
        'priority': 'P2',
        'condition': lambda stats: stats.get('mediumRate', 0) >= 40 and stats.get('lowRate', 0) >= 20,
        'materials': '讨论题目、计时器'
    },
    {
        'type': 'thinking_question',
        'title': '拓展思考题',
        'description': '抛出有挑战性的问题激发学生思考兴趣',
        'duration': 5,
        'priority': 'P2',
        'condition': lambda stats: stats.get('avgScore', 0) < 6 and stats.get('lowRate', 0) < 30,
        'materials': 'PPT展示'
    },
    {
        'type': 'break',
        'title': '课间休息提醒',
        'description': '建议安排短暂休息，缓解学生疲劳',
        'duration': 5,
        'priority': 'P0',
        'condition': lambda stats: stats.get('lowRate', 0) >= 50,
        'materials': ''
    }
]


def generate_suggestions(stats: Dict) -> List[Dict]:
    suggestions = []
    for rule in SUGGESTION_RULES:
        try:
            should_trigger = rule['condition'](stats)
        except Exception:
            should_trigger = False

        if should_trigger:
            suggestions.append({
                'id': f"sug_{datetime.now().strftime('%Y%m%d%H%M%S')}_{rule['type']}",
                'type': rule['type'],
                'title': rule['title'],
                'description': rule['description'],
                'durationMinutes': rule['duration'],
                'priority': rule['priority'],
                'materials': rule['materials'],
                'status': 'pending',
                'triggerCondition': _build_condition_desc(rule['type'], stats),
                'createdAt': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
                'beforeAttentionRate': stats.get('avgScore', 0)
            })

    suggestions.sort(key=lambda x: ['P0', 'P1', 'P2', 'P3'].index(x.get('priority', 'P3')))
    return suggestions[:5]


def evaluate_suggestion_effect(before_rate: float, after_rate: float) -> Dict[str, any]:
    improvement = after_rate - before_rate
    if improvement >= 1.0:
        effect = 'effective'
        desc = f'专注度提升{improvement:.1f}分，效果显著'
    elif improvement >= 0.3:
        effect = 'effective'
        desc = f'专注度提升{improvement:.1f}分，有一定效果'
    elif improvement >= -0.5:
        effect = 'ineffective'
        desc = f'专注度变化{improvement:+.1f}分，效果不明显'
    else:
        effect = 'ineffective'
        desc = f'专注度下降{abs(improvement):.1f}分，需要调整策略'

    return {
        'effect': effect,
        'improvement': round(improvement, 2),
        'description': desc,
        'evaluatedAt': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    }


def _build_condition_desc(suggestion_type: str, stats: Dict) -> str:
    descs = {
        'targeted_question': f"低专注度学生占比达{stats.get('lowRate', 0):.0f}%，需个别关注",
        'group_discussion': f"中低专注度合计占比{(stats.get('mediumRate', 0) + stats.get('lowRate', 0)):.0f}%，课堂氛围需激活",
        'thinking_question': f"平均专注度仅{stats.get('avgScore', 0):.1f}分，需提升学习兴趣",
        'break': f"低专注度占比高达{stats.get('lowRate', 0):.0f}%，学生可能疲劳"
    }
    return descs.get(suggestion_type, '系统自动触发')


PRIORITY_CONFIG = {
    'P0': {'color': '#ff4d4f', 'label': '紧急'},
    'P1': {'color': '#faad14', 'label': '重要'},
    'P2': {'color': '#1890ff', 'label': '一般'},
    'P3': {'color': '#52c41a', 'label': '可选'}
}

// 用户类型
export interface User {
  id: string;
  name: string;
  username?: string;
  role: 'teacher' | 'student';
  avatar?: string;
}

// 课堂信息
export interface Classroom {
  id: string;
  name: string;
  teacherId: string;
  teacherName: string;
  studentCount: number;
  startTime: string;
  endTime?: string;
  status: 'ongoing' | 'ended';
}

// 专注度数据
export interface AttentionData {
  timestamp: string;
  studentId: string;
  studentName: string;
  expressionType: 'looking' | 'head_down' | 'eyes_closed' | 'frowning' | 'neutral' | 'other';
  postureType: 'sitting_upright' | 'leaning_forward' | 'leaning_back' | 'lying_on_desk';
  quizScore?: number;
  attentionScore: number;
  attentionLevel: 'high' | 'medium' | 'low';
}

// 答题数据
export interface QuizData {
  id: string;
  classroomId: string;
  title: string;
  type: 'single' | 'multiple';
  options: QuizOption[];
  correctAnswer: string | string[];
  timeLimit: number;
  createdAt: string;
  status: 'draft' | 'published' | 'ended';
}

export interface QuizOption {
  id: string;
  text: string;
}

export interface StudentAnswer {
  studentId: string;
  quizId: string;
  answer: string | string[];
  isCorrect: boolean;
  timeSpent: number;
  submittedAt: string;
}

// 互动建议
export interface InteractionSuggestion {
  id: string;
  type: 'group_discussion' | 'targeted_question' | 'thinking_question' | 'break';
  title: string;
  description: string;
  duration: number;
  materials?: string;
  triggerCondition: string;
  priority: 'high' | 'medium' | 'low';
  createdAt: string;
}

// 互动记录
export interface InteractionRecord {
  id: string;
  classroomId: string;
  suggestionId: string;
  type: string;
  startTime: string;
  endTime?: string;
  duration: number;
  effect: 'effective' | 'ineffective' | 'pending';
  beforeAttentionRate: number;
  afterAttentionRate?: number;
}

// 统计数据
export interface StatisticsData {
  classroomId: string;
  date: string;
  avgAttentionScore: number;
  highAttentionRate: number;
  mediumAttentionRate: number;
  lowAttentionRate: number;
  quizParticipationRate: number;
  quizAccuracyRate: number;
  interactionCount: number;
  effectiveInteractionRate: number;
}

// 图表数据
export interface ChartData {
  time: string;
  value: number;
  level?: string;
}

// 热力图数据
export interface HeatmapData {
  studentId: string;
  studentName: string;
  timeSlot: string;
  attentionScore: number;
  attentionLevel: 'high' | 'medium' | 'low';
}

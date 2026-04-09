import { api } from './api'

export interface AttentionTimelineRecord {
    id: string
    stateType: string
    attentionScore: number
    startTime: string | null
    endTime: string | null
    durationSeconds: number
    stateDetails: string | null
    student: {
        id: string
        name: string
        studentNumber: string
    } | null
}

export interface TimelineSummary {
    totalRecords: number
    avgScore: number
    highRate: number
    mediumRate: number
    lowRate: number
    stateDistribution: Array<{
        stateType: string
        count: number
        avgScore: number
    }>
}

export interface SessionData {
    id: string
    sessionId: string
    classroomName: string
    startTime: string | null
    endTime: string | null
    status: string
    totalRecords: number | null
    avgScore: number
    highRate: number
    mediumRate: number
    lowRate: number
    students: Array<{
        student_number: string
        real_name: string
        avg_score: number
        record_count: number
        high_count: number
        medium_count: number
        low_count: number
    }>
    timeline: Array<{
        state_type: string
        attention_score: number
        start_time: string | null
        end_time: string | null
        duration_seconds: number
        state_details: string | null
        real_name: string
    }>
}

export interface OverallStats {
    totalSessions: number
    totalRecords: number
    uniqueStudents: number
    overallAvgScore: number
    topStudents: Array<{
        studentNumber: string
        name: string
        avgScore: number
        recordCount: number
    }>
}

export async function getAttentionTimeline(
    classroomId: number,
    options?: { studentId?: number; days?: number }
): Promise<{
    records: AttentionTimelineRecord[]
    summary: TimelineSummary
    totalRecords: number
}> {
    const params = new URLSearchParams()
    if (options?.studentId) params.append('studentId', String(options.studentId))
    if (options?.days) params.append('days', String(options.days))
    return api.get(`/attention/timeline?classroomId=${classroomId}&${params.toString()}`)
}

export async function saveDetectionRecord(data: {
    classroomId?: number
    sessionId?: string
    faces: Array<{
        studentId?: string | number
        isRegistered: boolean
        state: string
        attentionScore: number
        stateDetails?: string
    }>
}): Promise<{ message: string; savedCount: number; totalCount: number }> {
    return api.post('/attention/save-record', data)
}

export async function getHistoryReview(
    classroomId: number,
    options?: { days?: number }
): Promise<{
    sessions: SessionData[]
    totalSessions: number
    overallStats: OverallStats
}> {
    const params = options?.days ? `?days=${options.days}` : ''
    return api.get(`/attention/review/${classroomId}${params}`)
}

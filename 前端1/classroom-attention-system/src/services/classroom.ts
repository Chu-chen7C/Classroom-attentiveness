import { api } from './api'

export interface Classroom {
    id: string
    name: string
    description: string | null
    studentCount: number
    courseType: string | null
    startTime: string | null
    endTime: string | null
    status: string
    createdAt: string
}

export async function getClassrooms(): Promise<Classroom[]> {
    return api.get<Classroom[]>('/classrooms')
}

export async function createClassroom(data: {
    name: string
    description?: string
    courseType?: string
}): Promise<{ id: string; message: string }> {
    return api.post('/classrooms', data)
}

export async function updateClassroom(
    id: string,
    data: Partial<Classroom>
): Promise<{ message: string }> {
    return api.put(`/classrooms/${id}`, data)
}

export async function deleteClassroom(id: string): Promise<{ message: string }> {
    return api.delete(`/classrooms/${id}`)
}

export async function getOverviewStats(): Promise<{
    totalClasses: number
    totalStudents: number
    avgAttentionScore: number
    highAttentionRate: number
    recentSessions: Array<{ sessionId: string; status: string; avgAttentionScore: number }>
}> {
    return api.get('/classrooms/stats/overview')
}

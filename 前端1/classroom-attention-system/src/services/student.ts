import { api } from './api'

export interface Student {
    id: string
    studentId: string
    name: string
    seatRow: number | null
    seatCol: number | null
    faceRegistered: boolean
    joinTime: string | null
}

export async function getStudents(classroomId: string): Promise<Student[]> {
    return api.get(`/students?classroomId=${classroomId}`)
}

export async function addStudent(data: {
    studentId: string
    name: string
    classroomId: string
    seatRow?: number
    seatCol?: number
}): Promise<{ id: string; message: string }> {
    return api.post('/students', data)
}

export async function updateStudent(
    id: string,
    data: Partial<Student>
): Promise<{ message: string }> {
    return api.put(`/students/${id}`, data)
}

export async function deleteStudent(id: string): Promise<{ message: string }> {
    return api.delete(`/students/${id}`)
}

export async function registerFace(studentId: string, image: string | string[]): Promise<{
    message: string
    features: number[]
    featureCount: number
    sampleCount?: number
    rejectedSamples?: number
}> {
    if (Array.isArray(image)) {
        return api.post('/students/face/register', { studentId, images: image })
    }
    return api.post('/students/face/register', { studentId, image })
}

export async function deleteFace(studentId: string): Promise<{ message: string }> {
    return api.post('/students/face/delete', { studentId })
}

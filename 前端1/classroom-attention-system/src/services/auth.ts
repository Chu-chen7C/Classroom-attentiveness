import { api } from './api'
import { setToken } from './api'

export interface AuthResponse {
    token: string
    user: {
        id: string
        username: string
        realName: string
        role: 'teacher' | 'student'
    }
    message: string
}

export interface UserInfo {
    id: string
    username: string
    realName: string
    role: string
    email: string | null
    phone: string | null
    avatarUrl: string | null
}

export async function login(username: string, password: string): Promise<AuthResponse> {
    const res = await api.post<AuthResponse>('/auth/login', { username, password })
    setToken(res.token) 
    localStorage.setItem('user', JSON.stringify(res.user))
    return res              
}

export async function register(data: {
    username: string
    password: string
    realName: string
    role: string
    email?: string
    studentId?: string
}): Promise<AuthResponse> {
    const res = await api.post<AuthResponse>('/auth/register', data)
    setToken(res.token)
    localStorage.setItem('user', JSON.stringify(res.user))
    return res
}

export async function getCurrentUser(): Promise<UserInfo> {
    return api.get<UserInfo>('/auth/me')
}

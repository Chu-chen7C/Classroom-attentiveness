const BASE_URL = 'http://127.0.0.1:5000/api'

const REQUEST_TIMEOUT = 30000

let authToken: string | null = localStorage.getItem('token')

export function setToken(token: string) {
    authToken = token
    localStorage.setItem('token', token)
}

export function getToken(): string | null {
    return authToken || localStorage.getItem('token')
}

export function clearAuth() {
    authToken = null
    localStorage.removeItem('token')
    localStorage.removeItem('user')
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
    const token = getToken()
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...options.headers as Record<string, string>,
    }
    if (token) {
        headers['Authorization'] = `Bearer ${token}`
    }

    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT)

    try {
        console.log(`[API] ${options.method || 'GET'} ${BASE_URL}${url}`)
        const response = await fetch(`${BASE_URL}${url}`, {
            ...options,
            headers,
            signal: controller.signal,
        })

        clearTimeout(timeoutId)

        let data: any
        try {
            data = await response.json()
        } catch (parseErr) {
            console.error('[API] JSON解析失败:', parseErr)
            throw { code: response.status, error: '服务器响应格式异常', message: '服务器响应异常' }
        }

        if (!response.ok) {
            console.error(`[API] 请求失败 ${response.status}:`, data)
            throw { code: response.status, ...data }
        }

        console.log(`[API] 请求成功:`, url)
        return data as T
    } catch (err: any) {
        clearTimeout(timeoutId)
        if (err.name === 'AbortError') {
            console.error('[API] 请求超时:', url)
            throw { code: 408, error: '请求超时，请检查网络或稍后重试' }
        }
        throw err
    }
}

export const api = {
    get: <T>(url: string) => request<T>(url),
    post: <T>(url: string, body?: unknown) => request<T>(url, {
        method: 'POST',
        body: JSON.stringify(body),
    }),
    put: <T>(url: string, body?: unknown) => request<T>(url, {
        method: 'PUT',
        body: JSON.stringify(body),
    }),
    delete: <T>(url: string) => request<T>(url, { method: 'DELETE' }),
}

export default api

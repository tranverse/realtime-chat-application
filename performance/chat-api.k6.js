import http from 'k6/http'
import { check, fail } from 'k6'

const baseUrl = __ENV.API_BASE_URL || 'http://localhost:18080/api/v1'

export const options = {
  scenarios: {
    chat_read_paths: {
      executor: 'ramping-vus',
      stages: [
        { duration: '5s', target: 10 },
        { duration: '10s', target: 10 },
        { duration: '5s', target: 0 },
      ],
      gracefulRampDown: '3s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<750'],
    checks: ['rate>0.99'],
  },
}

export function setup() {
  const response = http.post(`${baseUrl}/auth/login`, JSON.stringify({
    email: __ENV.PERF_EMAIL || 'alice.e2e@example.com',
    password: __ENV.PERF_PASSWORD || 'E2ePassword123!',
  }), { headers: { 'Content-Type': 'application/json' } })

  if (response.status !== 200) fail(`Performance login failed: ${response.status} ${response.body}`)
  return { accessToken: response.json('data.accessToken') }
}

export default function ({ accessToken }) {
  const params = { headers: { Authorization: `Bearer ${accessToken}` } }
  const profile = http.get(`${baseUrl}/users/me`, params)
  check(profile, { 'profile is available': (response) => response.status === 200 })

  const conversations = http.get(`${baseUrl}/conversations?page=0&size=30`, params)
  check(conversations, { 'conversation list is available': (response) => response.status === 200 })

  if (conversations.status === 200) {
    const conversationId = conversations.json('data.items.0.id')
    if (conversationId) {
      const history = http.get(
        `${baseUrl}/conversations/${conversationId}/messages?size=20`,
        params,
      )
      check(history, { 'message history is available': (response) => response.status === 200 })
    }
  }
}

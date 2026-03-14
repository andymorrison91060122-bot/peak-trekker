export type Province = {
  id: string
  name: string
  code: string
  score: number
  active_users: number
}

export type Mountain = {
  id: string
  name: string
  altitude: number
  province: string
  province_code: string
  difficulty: 'beginner' | 'intermediate' | 'advanced' | 'expert'
  min_license: 'none' | 'basic' | 'intermediate' | 'advanced'
  latitude: number
  longitude: number
  description: string
  cover_image: string
  checkin_count: number
  created_at: string
}

export type User = {
  id: string
  email: string
  username: string
  avatar_url: string
  province: string
  province_code: string
  license_level: 'none' | 'basic' | 'intermediate' | 'advanced'
  total_altitude: number
  mountain_count: number
  created_at: string
}

export type Checkin = {
  id: string
  user_id: string
  mountain_id: string
  type: 'gps' | 'photo'
  status: 'pending' | 'approved' | 'rejected'
  photo_url: string | null
  latitude: number | null
  longitude: number | null
  note: string
  created_at: string
  mountain?: Mountain
  user?: User
}

export type Achievement = {
  id: string
  user_id: string
  type: string
  title: string
  description: string
  icon: string
  earned_at: string
}

export type Post = {
  id: string
  user_id: string
  checkin_id: string
  content: string
  poster_url: string | null
  like_count: number
  comment_count: number
  created_at: string
  user?: User
  checkin?: Checkin
}

export type LicenseLevel = {
  level: 'none' | 'basic' | 'intermediate' | 'advanced'
  label: string
  requirement: string
  max_altitude: number
}

export const LICENSE_LEVELS: LicenseLevel[] = [
  { level: 'none', label: '无执照', requirement: '无要求', max_altitude: 1000 },
  { level: 'basic', label: '初级登山证', requirement: '完成3座1000m以下', max_altitude: 2000 },
  { level: 'intermediate', label: '中级登山证', requirement: '完成3座2000m以下', max_altitude: 4000 },
  { level: 'advanced', label: '高级登山证', requirement: '完成3座4000m以下', max_altitude: 99999 },
]

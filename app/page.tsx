'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

export default function RootPage() {
  const router = useRouter()
  useEffect(() => {
    const user = localStorage.getItem('workshop_user')
    router.replace(user ? '/dashboard' : '/login')
  }, [router])
  return null
}

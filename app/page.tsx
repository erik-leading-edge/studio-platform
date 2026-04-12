'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function Page() {
  const [user, setUser] = useState<any>(undefined) // 👈 belangrijk
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [classes, setClasses] = useState<any[]>([])
  const [bookings, setBookings] = useState<any[]>([])
  const [credits, setCredits] = useState(0)

  const tenantId = '3b71f443-e5a2-4187-9c04-76f72dd619f6'

  // =========================
  // INIT + AUTH FIX
  // =========================

  useEffect(() => {
    let channel: any

    const init = async () => {
      const { data } = await supabase.auth.getSession()
      const u = data.session?.user || null

      setUser(u)

      if (!u) return

      await refresh(u)

      channel = supabase
        .channel('realtime-bookings')

        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'bookings' },
          () => refresh(u)
        )

        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'offerings' },
          () => refresh(u)
        )

        .subscribe()
    }

    init()

    const { data: listener } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const u = session?.user || null
        setUser(u)

        if (u) await refresh(u)
      }
    )

    return () => {
      if (channel) supabase.removeChannel(channel)
      listener.subscription.unsubscribe()
    }
  }, [])

  // =========================
  // DATA
  // =========================

  async function refresh(u: any) {
    const { data: cls } = await supabase
      .from('offerings')
      .select('*')
      .eq('tenant_id', tenantId)

    const { data: b } = await supabase
      .from('bookings')
      .select('*')
      .eq('user_id', u.id)

    const { data: pass } = await supabase
      .from('passes')
      .select('*')
      .eq('user_id', u.id)
      .single()

    setClasses(cls || [])
    setBookings(b || [])
    setCredits(pass?.credits_remaining || 0)
  }

  // =========================
  // LOGIN
  // =========================

  async function login() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      alert(error.message)
    }
  }

  async function logout() {
    await supabase.auth.signOut()
    setUser(null)
  }

  // =========================
  // HELPERS
  // =========================

  function getActiveBooking(id: string) {
    return bookings.find(
      b => b.offering_id === id && b.status === 'booked'
    )
  }

  function formatDate(dt: string) {
    return new Date(dt).toLocaleString('nl-NL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  // =========================
  // UI STATES
  // =========================

  // 🔄 loading
  if (user === undefined) {
    return <div className="p-10">Loading...</div>
  }

  // 🔐 LOGIN SCHERM
  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F5F2]">
        <div className="bg-white p-8 rounded-xl shadow w-80">
          <h2 className="text-lg font-semibold mb-4">Login</h2>

          <input
            className="border p-2 w-full mb-2"
            placeholder="Email"
            onChange={e => setEmail(e.target.value)}
          />

          <input
            type="password"
            className="border p-2 w-full mb-4"
            placeholder="Wachtwoord"
            onChange={e => setPassword(e.target.value)}
          />

          <button
            onClick={login}
            className="bg-blue-600 text-white w-full py-2 rounded"
          >
            Inloggen
          </button>
        </div>
      </div>
    )
  }

  // =========================
  // MAIN UI
  // =========================

  return (
    <div className="p-6 max-w-xl mx-auto">
      <div className="flex justify-between mb-4">
        <h1 className="text-xl font-semibold">Rooster</h1>
        <button onClick={logout}>Uitloggen</button>
      </div>

      <div className="mb-4">Credits: {credits}</div>

      {classes.map(c => {
        const booking = getActiveBooking(c.id)

        return (
          <div key={c.id} className="border p-4 mb-2">
            <div>{c.title}</div>
            <div>{formatDate(c.start_time)}</div>

            {booking ? (
              <button className="bg-red-500 text-white px-3 py-1 mt-2">
                Uitschrijven
              </button>
            ) : (
              <button className="bg-blue-600 text-white px-3 py-1 mt-2">
                Boek
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
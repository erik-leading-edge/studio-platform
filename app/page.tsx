'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

const TENANT_ID = '3b71f443-e5a2-4187-9c04-76f72dd619f6'

export default function Home() {
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [classes, setClasses] = useState<any[]>([])
  const [bookings, setBookings] = useState<any[]>([])
  const [waitlist, setWaitlist] = useState<any[]>([])
  const [credits, setCredits] = useState<number>(0)
  const [passId, setPassId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  // =========================
  // INIT
  // =========================

  useEffect(() => {
    init()
  }, [])

  const init = async () => {
    const { data } = await supabase.auth.getUser()
    const u = data.user
    setUser(u)

    if (u) await loadAll(u.id)

    setLoading(false)
  }

  const loadAll = async (userId: string) => {
    const [c, b, p, w] = await Promise.all([
      supabase.from('offerings').select('*').eq('tenant_id', TENANT_ID),
      supabase.from('bookings').select('*').eq('user_id', userId),
      supabase.from('passes').select('*').eq('user_id', userId).single(),
      supabase.from('waitlist_entries').select('*').eq('user_id', userId),
    ])

    setClasses(c.data || [])
    setBookings(b.data || [])
    setWaitlist(w.data || [])

    if (p.data) {
      setCredits(p.data.remaining_credits)
      setPassId(p.data.id)
    }
  }

  // =========================
  // AUTH
  // =========================

  const login = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      alert(error.message)
      return
    }

    const { data } = await supabase.auth.getUser()
    const u = data.user
    setUser(u)

    if (u) await loadAll(u.id)
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
  }

  // =========================
  // HELPERS
  // =========================

  const formatDate = (d: string) => {
    const date = new Date(d)
    return date.toLocaleString('nl-NL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  const isBooked = (id: string) =>
    bookings.find((b) => b.offering_id === id && b.status === 'booked')

  const isWaitlisted = (id: string) =>
    waitlist.find((w) => w.offering_id === id)

  const count = (id: string) =>
    bookings.filter(
      (b) => b.offering_id === id && b.status === 'booked'
    ).length

  // =========================
  // ACTIONS
  // =========================

  const refresh = async () => {
    if (user) await loadAll(user.id)
  }

  const book = async (c: any) => {
    if (credits <= 0) return alert('Geen credits')

    setBusyId(c.id)

    await supabase.from('bookings').insert({
      offering_id: c.id,
      user_id: user.id,
      tenant_id: TENANT_ID,
      status: 'booked',
    })

    await supabase
      .from('passes')
      .update({ remaining_credits: credits - 1 })
      .eq('id', passId)

    await refresh()
    setBusyId(null)
  }

  const unsubscribe = async (c: any) => {
    const b = bookings.find((x) => x.offering_id === c.id)

    await supabase
      .from('bookings')
      .update({ status: 'cancelled' })
      .eq('id', b.id)

    await supabase
      .from('passes')
      .update({ remaining_credits: credits + 1 })
      .eq('id', passId)

    await refresh()
  }

  const joinWaitlist = async (id: string) => {
    await supabase.from('waitlist_entries').insert({
      offering_id: id,
      user_id: user.id,
      tenant_id: TENANT_ID,
    })

    await refresh()
  }

  // =========================
  // UI STATES
  // =========================

  if (loading) return <div className="p-10">Loading...</div>

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#F7F5F2]">
        <div className="bg-white p-8 rounded-2xl shadow w-full max-w-sm">
          <h1 className="text-xl mb-4 font-semibold">Inloggen</h1>

          <input
            className="border p-2 w-full mb-2 rounded"
            placeholder="Email"
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            className="border p-2 w-full mb-4 rounded"
            placeholder="Wachtwoord"
            type="password"
            onChange={(e) => setPassword(e.target.value)}
          />

          <button
            className="w-full bg-[#1A3F78] text-white py-2 rounded-lg"
            onClick={login}
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
    <div className="min-h-screen bg-[#F7F5F2] p-6">
      <div className="max-w-2xl mx-auto">

        {/* HEADER */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold text-gray-800">
            Yogastudio Sangha
          </h1>

          <button
            onClick={logout}
            className="text-sm text-gray-500 hover:text-black"
          >
            Uitloggen
          </button>
        </div>

        {/* CREDITS */}
        <div className="mb-6 text-gray-600 text-sm">
          Credits: <span className="font-semibold">{credits}</span>
        </div>

        {/* CLASSES */}
        <div className="space-y-4">
          {classes.map((c) => {
            const booked = isBooked(c.id)
            const full = count(c.id) >= c.capacity
            const busy = busyId === c.id

            return (
              <div
                key={c.id}
                className="bg-white rounded-2xl p-5 shadow-sm border flex justify-between items-center"
              >
                {/* LEFT */}
                <div>
                  <div className="font-semibold text-lg text-gray-800">
                    {c.title}
                  </div>

                  <div className="text-gray-500 text-sm mt-1">
                    {formatDate(c.start_time)}
                  </div>

                  <div className="text-xs text-gray-400 mt-2">
                    {count(c.id)} / {c.capacity}
                  </div>
                </div>

                {/* RIGHT CTA */}
                <div>
                  {booked ? (
                    <button
                      onClick={() => unsubscribe(c)}
                      disabled={busy}
                      className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded-lg shadow-sm transition"
                    >
                      Uitschrijven
                    </button>
                  ) : full ? (
                    isWaitlisted(c.id) ? (
                      <button className="bg-orange-200 text-orange-700 px-4 py-2 rounded-lg">
                        Wachtlijst
                      </button>
                    ) : (
                      <button
                        onClick={() => joinWaitlist(c.id)}
                        className="bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg shadow-sm transition"
                      >
                        Wachtlijst
                      </button>
                    )
                  ) : (
                    <button
                      onClick={() => book(c)}
                      disabled={busy}
                      className="bg-[#1A3F78] hover:bg-[#16325f] text-white px-4 py-2 rounded-lg shadow-sm transition"
                    >
                      Boek
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
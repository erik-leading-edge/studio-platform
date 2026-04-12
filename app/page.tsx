'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function Page() {
  const [user, setUser] = useState<any>(undefined)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  const [classes, setClasses] = useState<any[]>([])
  const [bookings, setBookings] = useState<any[]>([])
  const [credits, setCredits] = useState(0)

  const tenantId = '3b71f443-e5a2-4187-9c04-76f72dd619f6'

  // =========================
  // INIT + REALTIME
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
          () => refresh({ id: u.id })
        )

        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'waitlist_entries' },
          () => refresh({ id: u.id })
        )

        .on(
          'postgres_changes',
          { event: '*', schema: 'public', table: 'offerings' },
          () => refresh({ id: u.id })
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
    if (!u) return

    const { data: cls } = await supabase
      .from('offerings')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('start_time')

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
    setCredits(pass?.remaining_credits || 0)
  }

  // =========================
  // HELPERS
  // =========================

  function getActiveBooking(offeringId: string) {
    return bookings.find(
      b => b.offering_id === offeringId && b.status === 'booked'
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
  // 📅 KALENDER
  // =========================

  const createICS = (c: any) => {
    const start = new Date(c.start_time)
    const end = new Date(start.getTime() + 60 * 60 * 1000)

    const format = (d: Date) =>
      d.toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z'

    return `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VEVENT
SUMMARY:${c.title}
DTSTART:${format(start)}
DTEND:${format(end)}
DESCRIPTION:Yogastudio Sangha
END:VEVENT
END:VCALENDAR`
  }

  const downloadICS = (c: any) => {
    const blob = new Blob([createICS(c)], { type: 'text/calendar' })
    const url = window.URL.createObjectURL(blob)

    const a = document.createElement('a')
    a.href = url
    a.download = `${c.title}.ics`
    a.click()
  }

  // =========================
  // ACTIONS
  // =========================

  async function bookClass(c: any) {
    if (!user) return

    if (credits <= 0) {
      alert('Geen credits')
      return
    }

    if (getActiveBooking(c.id)) return

    // 🔥 OPTIMISTIC UPDATE
    setBookings(prev => [
      ...prev,
      {
        offering_id: c.id,
        user_id: user.id,
        status: 'booked',
      },
    ])

    setCredits(prev => prev - 1)

    try {
      const { error } = await supabase.from('bookings').insert({
        user_id: user.id,
        offering_id: c.id,
        status: 'booked',
        tenant_id: tenantId,
      })

      if (error) throw error

      await supabase
        .from('passes')
        .update({ remaining_credits: credits - 1 })
        .eq('user_id', user.id)

    } catch (e) {
      console.error(e)
      alert('Fout bij boeken')
      await refresh(user)
    }
  }

  async function cancelBooking(booking: any) {
    if (!user) return

    setBookings(prev =>
      prev.map(b =>
        b.offering_id === booking.offering_id
          ? { ...b, status: 'cancelled' }
          : b
      )
    )

    setCredits(prev => prev + 1)

    try {
      await supabase
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', booking.id)

      await supabase
        .from('passes')
        .update({ remaining_credits: credits + 1 })
        .eq('user_id', user.id)

    } catch (e) {
      console.error(e)
      alert('Fout bij annuleren')
      await refresh(user)
    }
  }

  async function login() {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (error) alert(error.message)
  }

  async function logout() {
    await supabase.auth.signOut()
    setUser(null)
  }

  // =========================
  // UI
  // =========================

  if (user === undefined) {
    return <div className="p-10">Loading...</div>
  }

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

  return (
    <div className="min-h-screen bg-[#F7F5F2] p-6">
      <div className="max-w-xl mx-auto">

        <div className="flex justify-between mb-6">
          <h1 className="text-xl font-semibold">
            Yogastudio Sangha
          </h1>

          <button onClick={logout}>
            Uitloggen
          </button>
        </div>

        <div className="mb-4 text-gray-700">
          Credits: {credits}
        </div>

        <div className="space-y-4">
          {classes.map(c => {
            const booking = getActiveBooking(c.id)

            return (
              <div
                key={c.id}
                className="bg-white rounded-2xl shadow-sm border p-5"
              >
                <div className="flex justify-between items-center">
                  <div>
                    <div className="font-semibold text-lg">
                      {c.title}
                    </div>

                    <div className="text-gray-500 text-sm">
                      {formatDate(c.start_time)}
                    </div>
                  </div>

                  {booking ? (
                    <button
                      onClick={() => cancelBooking(booking)}
                      className="bg-red-500 text-white px-4 py-2 rounded-xl"
                    >
                      Uitschrijven
                    </button>
                  ) : (
                    <button
                      onClick={() => bookClass(c)}
                      className="bg-blue-600 text-white px-4 py-2 rounded-xl"
                    >
                      Boek
                    </button>
                  )}
                </div>

                {/* 📅 ICS */}
                {booking && (
                  <div className="mt-3 text-right">
                    <button
                      onClick={() => downloadICS(c)}
                      className="text-xs text-gray-500 underline"
                    >
                      Zet in agenda
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
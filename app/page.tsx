'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function Page() {
  const [user, setUser] = useState<any>(null)
  const [classes, setClasses] = useState<any[]>([])
  const [bookings, setBookings] = useState<any[]>([])
  const [credits, setCredits] = useState(0)
  const [loadingAction, setLoadingAction] = useState<string | null>(null)

  const tenantId = '3b71f443-e5a2-4187-9c04-76f72dd619f6'

  // =========================
  // INIT + REALTIME
  // =========================

  useEffect(() => {
  let channel: any

  const init = async () => {
    // 🔥 gebruik session (niet getUser)
    const { data: sessionData } = await supabase.auth.getSession()
    const u = sessionData.session?.user

    if (!u) {
      setUser(null)
      return
    }

    setUser(u)
    await refresh(u)

    // 🔥 realtime pas starten NA user
    channel = supabase
      .channel('realtime-bookings')

      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'bookings' },
        () => refresh(u)
      )

      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'waitlist_entries' },
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

  // 🔥 luister naar login/logout (CRUCIAAL)
  const { data: listener } = supabase.auth.onAuthStateChange(
    async (_event, session) => {
      const u = session?.user || null
      setUser(u)

      if (u) {
        await refresh(u)
      }
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
    setCredits(pass?.credits_remaining || 0)
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
    const d = new Date(dt)
    return d.toLocaleString('nl-NL', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  // =========================
  // 📅 KALENDER (ICS)
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

  async function bookClass(offeringId: string) {
    if (!user) return

    if (getActiveBooking(offeringId)) return

    setLoadingAction(offeringId)

    try {
      if (credits <= 0) {
        alert('Geen credits')
        return
      }

      const { error } = await supabase.from('bookings').insert({
        user_id: user.id,
        offering_id: offeringId,
        status: 'booked',
        tenant_id: tenantId,
      })

      if (error) {
        if (error.message.includes('bookings_unique_active')) return
        throw error
      }

      await supabase
        .from('passes')
        .update({ credits_remaining: credits - 1 })
        .eq('user_id', user.id)

      await refresh(user)
    } catch (e) {
      console.error(e)
      alert('Fout bij boeken')
    } finally {
      setLoadingAction(null)
    }
  }

  async function cancelBooking(booking: any) {
    if (!user) return

    setLoadingAction(booking.offering_id)

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
        .update({ credits_remaining: credits + 1 })
        .eq('user_id', user.id)

      await refresh(user)
    } catch (e) {
      console.error(e)
      alert('Fout bij annuleren')
    } finally {
      setLoadingAction(null)
    }
  }

  // =========================
  // UI
  // =========================

  if (!user) {
    return <div className="p-10">Login nodig</div>
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-xl mx-auto">

        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold">
            Yogastudio Sangha
          </h1>
          <button
            onClick={() => supabase.auth.signOut()}
            className="text-sm text-gray-600"
          >
            Uitloggen
          </button>
        </div>

        <div className="mb-4 text-gray-700">
          Credits: {credits}
        </div>

        <div className="space-y-4">
          {classes.map(c => {
            const myBooking = getActiveBooking(c.id)

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

                  <div>
                    {myBooking ? (
                      <button
                        disabled={loadingAction === c.id}
                        onClick={() => cancelBooking(myBooking)}
                        className="bg-red-500 text-white px-4 py-2 rounded-xl"
                      >
                        Uitschrijven
                      </button>
                    ) : (
                      <button
                        disabled={loadingAction === c.id}
                        onClick={() => bookClass(c.id)}
                        className="bg-blue-600 text-white px-4 py-2 rounded-xl"
                      >
                        Boek
                      </button>
                    )}
                  </div>
                </div>

                {/* 📅 Alleen tonen als geboekt */}
                {myBooking && (
                  <div className="mt-3 text-right">
                    <button
                      onClick={() => downloadICS(c)}
                      className="text-xs text-gray-500 underline hover:text-gray-700"
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
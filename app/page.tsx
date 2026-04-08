'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

const TENANT_ID = '3b71f443-e5a2-4187-9c04-76f72dd619f6'
const FREE_CANCEL_HOURS = 6
const PROMOTE_LIMIT_HOURS = 1

export default function Home() {
  const [user, setUser] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [classes, setClasses] = useState<any[]>([])
  const [bookings, setBookings] = useState<any[]>([])
  const [waitlist, setWaitlist] = useState<any[]>([])
  const [credits, setCredits] = useState<number>(0)
  const [passId, setPassId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    checkUser()
  }, [])

  // =========================
  // 🔐 AUTH
  // =========================

  const checkUser = async () => {
    const { data } = await supabase.auth.getUser()
    const currentUser = data.user
    setUser(currentUser)

    if (currentUser) {
      await loadClasses()
      await loadBookings(currentUser.id)
      await loadCredits(currentUser.id)
      await loadWaitlist(currentUser.id)
    }
  }

  const login = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) alert(error.message)
    else checkUser()
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setBookings([])
    setCredits(0)
  }

  // =========================
  // 📦 LOAD DATA
  // =========================

  const loadClasses = async () => {
    const { data } = await supabase
      .from('offerings')
      .select('*')
      .eq('tenant_id', TENANT_ID)
      .order('start_time')

    setClasses(data || [])
  }

  const loadBookings = async (userId: string) => {
    const { data } = await supabase
      .from('bookings')
      .select('*')
      .eq('tenant_id', TENANT_ID)
      .eq('user_id', userId)

    setBookings(data || [])
  }

  const loadWaitlist = async (userId: string) => {
    const { data } = await supabase
      .from('waitlist_entries')
      .select('*')
      .eq('tenant_id', TENANT_ID)
      .eq('user_id', userId)

    setWaitlist(data || [])
  }

  const loadCredits = async (userId: string) => {
    const { data } = await supabase
      .from('passes')
      .select('*')
      .eq('user_id', userId)
      .eq('tenant_id', TENANT_ID)
      .limit(1)
      .single()

    if (data) {
      setCredits(data.remaining_credits)
      setPassId(data.id)
    }
  }

  // =========================
  // 🧠 HELPERS
  // =========================

  const formatDateTime = (dateString: string) => {
    const d = new Date(dateString)

    const weekday = d.toLocaleDateString('nl-NL', { weekday: 'short' })
    const day = d.getDate()
    const month = d.toLocaleDateString('en-GB', { month: 'short' })
    const time = d.toLocaleTimeString('nl-NL', {
      hour: 'numeric',
      minute: '2-digit',
    })

    return `${weekday} ${day} ${month} ${time}`
  }

  const sendEmail = async (to: string, subject: string, body: string) => {
    await supabase.from('email_queue').insert({
      to_email: to,
      subject,
      body,
    })
  }

  const getBooking = (offeringId: string) =>
    bookings.find((b) => b.offering_id === offeringId)

  const isBooked = (offeringId: string) =>
    getBooking(offeringId)?.status === 'booked'

  const isWaitlisted = (offeringId: string) =>
    waitlist.find((w) => w.offering_id === offeringId)

  const getBookedCount = (offeringId: string) =>
    bookings.filter(
      (b) => b.offering_id === offeringId && b.status === 'booked'
    ).length

  const isFull = (offering: any) =>
    getBookedCount(offering.id) >= offering.capacity

  // =========================
  // 🚀 AUTO PROMOTE
  // =========================

  const autoPromote = async (offering: any) => {
    const hoursBefore =
      (new Date(offering.start_time).getTime() - new Date().getTime()) /
      3600000

    if (hoursBefore < PROMOTE_LIMIT_HOURS) return

    const { data: next } = await supabase
      .from('waitlist_entries')
      .select('*')
      .eq('offering_id', offering.id)
      .order('created_at')
      .limit(1)
      .maybeSingle()

    if (!next) return

    await supabase.from('bookings').insert({
      offering_id: offering.id,
      user_id: next.user_id,
      tenant_id: TENANT_ID,
      status: 'booked',
    })

    await supabase
      .from('waitlist_entries')
      .delete()
      .eq('id', next.id)

    // 📧 notificatie
    await sendEmail(
      user.email,
      'Je bent geplaatst!',
      `Je bent geplaatst voor ${offering.title} op ${formatDateTime(
        offering.start_time
      )}`
    )
  }

  // =========================
  // 📅 BOOK
  // =========================

  const book = async (offering: any) => {
    if (!user) return

    if (credits <= 0) {
      alert('Geen credits beschikbaar')
      return
    }

    if (isFull(offering)) {
      alert('Les is vol')
      return
    }

    setBusyId(offering.id)

    const existing = getBooking(offering.id)

    if (existing) {
      await supabase
        .from('bookings')
        .update({
          status: 'booked',
          cancelled_at: null,
        })
        .eq('id', existing.id)
    } else {
      await supabase.from('bookings').insert({
        offering_id: offering.id,
        user_id: user.id,
        tenant_id: TENANT_ID,
        status: 'booked',
      })
    }

    await supabase
      .from('passes')
      .update({ remaining_credits: credits - 1 })
      .eq('id', passId)

    await sendEmail(
      user.email,
      'Boeking bevestigd',
      `Je hebt ${offering.title} geboekt op ${formatDateTime(
        offering.start_time
      )}`
    )

    await loadBookings(user.id)
    await loadCredits(user.id)
    setBusyId(null)
  }

  // =========================
  // ❌ CANCEL
  // =========================

  const unsubscribe = async (offeringId: string) => {
    const booking = getBooking(offeringId)
    if (!booking) return

    const offering = classes.find((c) => c.id === offeringId)

    const hoursBefore =
      (new Date(offering.start_time).getTime() - new Date().getTime()) /
      3600000

    setBusyId(offeringId)

    await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', booking.id)

    if (hoursBefore > FREE_CANCEL_HOURS) {
      await supabase
        .from('passes')
        .update({ remaining_credits: credits + 1 })
        .eq('id', passId)
    }

    await sendEmail(
      user.email,
      'Uitschrijving bevestigd',
      `Je bent uitgeschreven voor ${offering.title}`
    )

    await autoPromote(offering)

    await loadBookings(user.id)
    await loadCredits(user.id)
    await loadWaitlist(user.id)

    setBusyId(null)
  }

  // =========================
  // 🟠 WAITLIST
  // =========================

  const joinWaitlist = async (offeringId: string) => {
    if (!user) return

    setBusyId(offeringId)

    const { error } = await supabase.from('waitlist_entries').insert({
      offering_id: offeringId,
      user_id: user.id,
      tenant_id: TENANT_ID,
    })

    if (error) {
      alert(error.message)
      setBusyId(null)
      return
    }

    await sendEmail(
      user.email,
      'Op wachtlijst',
      'Je staat op de wachtlijst'
    )

    await loadWaitlist(user.id)
    setBusyId(null)
  }

  // =========================
  // UI
  // =========================

  if (!user) {
    return (
      <div className="p-10 max-w-md mx-auto">
        <input
          className="border p-2 w-full mb-2"
          placeholder="Email"
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className="border p-2 w-full mb-2"
          placeholder="Password"
          type="password"
          onChange={(e) => setPassword(e.target.value)}
        />
        <button
          className="bg-blue-600 text-white px-4 py-2"
          onClick={login}
        >
          Login
        </button>
      </div>
    )
  }

  return (
    <div className="p-10">
      <div className="flex justify-between mb-4">
        <h1>Rooster</h1>
        <button onClick={logout}>Uitloggen</button>
      </div>

      <div>Credits: {credits}</div>

      {classes.map((c) => {
        const booked = isBooked(c.id)
        const full = isFull(c)
        const busy = busyId === c.id

        return (
          <div key={c.id} className="border p-4 mb-2">
            <div>{c.title}</div>
            <div>{formatDateTime(c.start_time)}</div>
            <div>
              {getBookedCount(c.id)} / {c.capacity}
            </div>

            {booked ? (
              <button onClick={() => unsubscribe(c.id)}>
                Uitschrijven
              </button>
            ) : full ? (
              isWaitlisted(c.id) ? (
                <button disabled>Op wachtlijst</button>
              ) : (
                <button onClick={() => joinWaitlist(c.id)}>
                  Wachtlijst
                </button>
              )
            ) : (
              <button onClick={() => book(c)}>Boek</button>
            )}
          </div>
        )
      })}
    </div>
  )
}
'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

const TENANT_ID = '3b71f443-e5a2-4187-9c04-76f72dd619f6'
const FREE_CANCEL_HOURS = 6

export default function Home() {
  const [user, setUser] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [classes, setClasses] = useState<any[]>([])
  const [bookings, setBookings] = useState<any[]>([])
  const [credits, setCredits] = useState<number>(0)
  const [passId, setPassId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    checkUser()
  }, [])

  const checkUser = async () => {
    const { data } = await supabase.auth.getUser()
    const currentUser = data.user
    setUser(currentUser)

    if (currentUser) {
      await loadClasses()
      await loadBookings(currentUser.id)
      await loadCredits(currentUser.id)
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

  const getBooking = (offeringId: string) => {
    return bookings.find((b) => b.offering_id === offeringId)
  }

  const isBooked = (offeringId: string) => {
    const b = getBooking(offeringId)
    return b && b.status === 'booked'
  }

  const getBookedCount = (offeringId: string) => {
    return bookings.filter(
      (b) => b.offering_id === offeringId && b.status === 'booked'
    ).length
  }

  const isFull = (offering: any) => {
    return getBookedCount(offering.id) >= offering.capacity
  }

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

    // credit afboeken
    await supabase
      .from('passes')
      .update({
        remaining_credits: credits - 1,
      })
      .eq('id', passId)

    await loadBookings(user.id)
    await loadCredits(user.id)
    setBusyId(null)
  }

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

    // credit teruggeven als op tijd
    if (hoursBefore > FREE_CANCEL_HOURS) {
      await supabase
        .from('passes')
        .update({
          remaining_credits: credits + 1,
        })
        .eq('id', passId)
    }

    await loadBookings(user.id)
    await loadCredits(user.id)
    setBusyId(null)
  }

  if (!user) {
    return (
      <div className="p-10 max-w-md mx-auto">
        <h1 className="text-xl mb-4">Login</h1>

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
        <h1 className="text-xl">Rooster</h1>
        <button
          className="bg-gray-600 text-white px-3 py-1"
          onClick={logout}
        >
          Uitloggen
        </button>
      </div>

      <div className="mb-4">
        Credits: <strong>{credits}</strong>
      </div>

      {classes.map((c) => {
        const booked = isBooked(c.id)
        const full = isFull(c)
        const busy = busyId === c.id

        return (
          <div key={c.id} className="border p-4 mb-2">
            <div className="font-bold">{c.title}</div>
            <div>{new Date(c.start_time).toLocaleString()}</div>

            <div className="text-sm mt-1">
              {getBookedCount(c.id)} / {c.capacity} deelnemers
            </div>

            {booked ? (
              <button
                className="bg-red-600 text-white px-3 py-1 mt-2"
                disabled={busy}
                onClick={() => unsubscribe(c.id)}
              >
                {busy ? 'Bezig...' : 'Uitschrijven'}
              </button>
            ) : full ? (
              <button
                className="bg-gray-400 text-white px-3 py-1 mt-2"
                disabled
              >
                Vol
              </button>
            ) : (
              <button
                className="bg-green-600 text-white px-3 py-1 mt-2"
                disabled={busy}
                onClick={() => book(c)}
              >
                {busy ? 'Bezig...' : 'Boek'}
              </button>
            )}
          </div>
        )
      })}
    </div>
  )
}
'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

const TENANT_ID = '3b71f443-e5a2-4187-9c04-76f72dd619f6'

export default function Home() {
  const [user, setUser] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [classes, setClasses] = useState<any[]>([])
  const [bookings, setBookings] = useState<any[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  useEffect(() => {
    checkUser()
  }, [])

  const checkUser = async () => {
    const { data } = await supabase.auth.getUser()
    const currentUser = data.user
    setUser(currentUser)

    if (currentUser) {
      loadClasses()
      loadBookings(currentUser.id)
    }
  }

  const login = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      alert(error.message)
    } else {
      checkUser()
    }
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setBookings([])
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

  const getBooking = (offeringId: string) => {
    return bookings.find((b) => b.offering_id === offeringId)
  }

  const isBooked = (offeringId: string) => {
    const b = getBooking(offeringId)
    return b && b.status === 'booked'
  }

  const book = async (offeringId: string) => {
    if (!user) return

    setBusyId(offeringId)

    const existing = getBooking(offeringId)

    if (existing) {
      // 🔁 HERINSCHRIJVEN
      const { error } = await supabase
        .from('bookings')
        .update({
          status: 'booked',
          cancelled_at: null,
        })
        .eq('id', existing.id)

      if (error) {
        alert(error.message)
        setBusyId(null)
        return
      }
    } else {
      // ➕ NIEUWE BOOKING
      const { error } = await supabase.from('bookings').insert({
        offering_id: offeringId,
        user_id: user.id,
        tenant_id: TENANT_ID,
        status: 'booked',
      })

      if (error) {
        alert(error.message)
        setBusyId(null)
        return
      }
    }

    await loadBookings(user.id)
    setBusyId(null)
  }

  const unsubscribe = async (offeringId: string) => {
    if (!user) return

    const booking = getBooking(offeringId)
    if (!booking) return

    setBusyId(offeringId)

    const { error } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', booking.id)

    if (error) {
      alert(error.message)
      setBusyId(null)
      return
    }

    await loadBookings(user.id)
    setBusyId(null)
  }

  // 🔐 LOGIN VIEW
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

  // 📅 ROOSTER VIEW
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

      {classes.map((c) => {
        const booked = isBooked(c.id)
        const busy = busyId === c.id

        return (
          <div key={c.id} className="border p-4 mb-2">
            <div className="font-bold">{c.title}</div>
            <div>{new Date(c.start_time).toLocaleString()}</div>

            {booked ? (
              <button
                className="bg-red-600 text-white px-3 py-1 mt-2"
                disabled={busy}
                onClick={() => unsubscribe(c.id)}
              >
                {busy ? 'Bezig...' : 'Uitschrijven'}
              </button>
            ) : (
              <button
                className="bg-green-600 text-white px-3 py-1 mt-2"
                disabled={busy}
                onClick={() => book(c.id)}
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
'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

const TENANT_ID = '3b71f443-e5a2-4187-9c04-76f72dd619f6'

type AppUser = {
  id: string
  email?: string
}

type Offering = {
  id: string
  title: string
  start_time: string
}

type Booking = {
  id: string
  offering_id: string
  status: string
}

export default function Home() {
  const [user, setUser] = useState<AppUser | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [classes, setClasses] = useState<Offering[]>([])
  const [bookings, setBookings] = useState<Booking[]>([])
  const [busyOfferingId, setBusyOfferingId] = useState<string | null>(null)

  useEffect(() => {
    checkUser()
  }, [])

  const checkUser = async () => {
    const { data, error } = await supabase.auth.getUser()
    if (error) {
      console.error(error)
      return
    }

    const currentUser = data.user
      ? { id: data.user.id, email: data.user.email ?? undefined }
      : null

    setUser(currentUser)

    if (currentUser) {
      await Promise.all([loadClasses(), loadBookings(currentUser.id)])
    }
  }

  const login = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      alert(error.message)
      return
    }

    await checkUser()
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setBookings([])
  }

  const loadClasses = async () => {
    const { data, error } = await supabase
      .from('offerings')
      .select('id, title, start_time')
      .eq('tenant_id', TENANT_ID)
      .order('start_time')

    if (error) {
      console.error(error)
      alert(error.message)
      return
    }

    setClasses((data as Offering[]) || [])
  }

  const loadBookings = async (userId: string) => {
    const { data, error } = await supabase
      .from('bookings')
      .select('id, offering_id, status')
      .eq('tenant_id', TENANT_ID)
      .eq('user_id', userId)
      .in('status', ['booked', 'attended'])

    if (error) {
      console.error(error)
      alert(error.message)
      return
    }

    setBookings((data as Booking[]) || [])
  }

  const getBookingForOffering = (offeringId: string) => {
    return bookings.find((b) => b.offering_id === offeringId) || null
  }

  const isBooked = (offeringId: string) => {
    return !!getBookingForOffering(offeringId)
  }

  const book = async (offeringId: string) => {
    if (!user) return

    setBusyOfferingId(offeringId)

    const { error } = await supabase.from('bookings').insert({
      offering_id: offeringId,
      user_id: user.id,
      tenant_id: TENANT_ID,
      status: 'booked',
    })

    setBusyOfferingId(null)

    if (error) {
      alert(error.message)
      return
    }

    await loadBookings(user.id)
  }

  const unsubscribe = async (offeringId: string) => {
    if (!user) return

    const booking = getBookingForOffering(offeringId)
    if (!booking) return

    setBusyOfferingId(offeringId)

    const { error } = await supabase
      .from('bookings')
      .update({
        status: 'cancelled',
        cancelled_at: new Date().toISOString(),
      })
      .eq('id', booking.id)

    setBusyOfferingId(null)

    if (error) {
      alert(error.message)
      return
    }

    await loadBookings(user.id)
  }

  if (!user) {
    return (
      <div className="p-10 max-w-md mx-auto">
        <h1 className="text-xl mb-4">Login</h1>

        <input
          className="border p-2 w-full mb-2"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          className="border p-2 w-full mb-2"
          placeholder="Password"
          type="password"
          value={password}
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
      <div className="flex items-center justify-between mb-4">
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
        const busy = busyOfferingId === c.id

        return (
          <div key={c.id} className="border p-4 mb-2">
            <div className="font-bold">{c.title}</div>
            <div>{new Date(c.start_time).toLocaleString()}</div>

            {booked ? (
              <button
                className="bg-red-600 text-white px-3 py-1 mt-2 disabled:opacity-50"
                disabled={busy}
                onClick={() => unsubscribe(c.id)}
              >
                {busy ? 'Bezig...' : 'Uitschrijven'}
              </button>
            ) : (
              <button
                className="bg-green-600 text-white px-3 py-1 mt-2 disabled:opacity-50"
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
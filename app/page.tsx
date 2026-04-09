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

  useEffect(() => {
    const init = async () => {
      const { data } = await supabase.auth.getUser()
      if (!data.user) return
      setUser(data.user)
      await refresh(data.user)
    }
    init()
  }, [])

  async function refresh(u: any) {
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

  // 🔒 alleen actieve booking
  function getActiveBooking(offeringId: string) {
    return bookings.find(
      b => b.offering_id === offeringId && b.status === 'booked'
    )
  }

  async function bookClass(offeringId: string) {
    if (!user) return

    // 🔒 idempotent guard (frontend)
    if (getActiveBooking(offeringId)) {
      console.log('Already booked → ignore')
      return
    }

    setLoadingAction(offeringId)

    try {
      // check credits
      if (credits <= 0) {
        alert('Geen credits')
        return
      }

      // insert booking
      const { error } = await supabase.from('bookings').insert({
        user_id: user.id,
        offering_id: offeringId,
        status: 'booked',
        tenant_id: tenantId,
      })

      // 🔒 backend guard (constraint)
      if (error) {
        if (error.message.includes('bookings_active_unique')) {
          console.log('Duplicate prevented by DB')
          return
        }
        throw error
      }

      // credit verminderen
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
      // status wijzigen (historie blijft!)
      await supabase
        .from('bookings')
        .update({
          status: 'cancelled',
          cancelled_at: new Date().toISOString(),
        })
        .eq('id', booking.id)

      // credit terug
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
                className="bg-white rounded-2xl shadow-sm border p-5 flex justify-between items-center"
              >
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
            )
          })}
        </div>
      </div>
    </div>
  )
}
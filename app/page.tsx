'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function Home() {
  const [user, setUser] = useState<any>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [classes, setClasses] = useState<any[]>([])

  useEffect(() => {
    checkUser()
  }, [])

  const checkUser = async () => {
    const { data } = await supabase.auth.getUser()
    setUser(data.user)

    if (data.user) loadClasses()
  }

  const login = async () => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (!error) {
      checkUser()
    } else {
      alert(error.message)
    }
  }

  const loadClasses = async () => {
    const { data } = await supabase
      .from('offerings')
      .select('*')
      .order('start_time')

    setClasses(data || [])
  }

  const book = async (offeringId: string) => {
    const { data } = await supabase.auth.getUser()

    await supabase.from('bookings').insert({
      offering_id: offeringId,
      user_id: data.user?.id,
      tenant_id: '3b71f443-e5a2-4187-9c04-76f72dd619f6'
    })

    alert('Booked!')
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
      <h1 className="text-xl mb-4">Rooster</h1>

      {classes.map((c) => (
        <div key={c.id} className="border p-4 mb-2">
          <div className="font-bold">{c.title}</div>
          <div>{new Date(c.start_time).toLocaleString()}</div>

          <button
            className="bg-green-600 text-white px-3 py-1 mt-2"
            onClick={() => book(c.id)}
          >
            Boek
          </button>
        </div>
      ))}
    </div>
  )
}
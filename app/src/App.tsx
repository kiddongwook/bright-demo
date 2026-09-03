import { useState } from 'react';
import { SessionProvider, useSession } from './auth/session';
import { Gate } from './screens/Gate';
import { Otp } from './screens/Otp';
import { PickRole } from './screens/PickRole';
import { Home } from './screens/Home';
import './theme.css';
function Shell() {
  const { session, active, memberships, loading } = useSession();
  const [phone, setPhone] = useState<string|null>(null);
  if (loading) return null;
  let screen;
  if (!session) screen = phone ? <Otp phone={phone} onBack={() => setPhone(null)} /> : <Gate onSent={setPhone} />;
  else if (!active) screen = memberships.length ? <PickRole /> : <Gate onSent={setPhone} />;
  else screen = <Home />;
  return <div className="shell"><div className="app">{screen}</div></div>;
}
export default function App() { return <SessionProvider><Shell /></SessionProvider>; }

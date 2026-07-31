import { useNavigate } from 'react-router-dom';

import { useAuth } from './auth';
import { hasModuleAccess } from './module-access';

export function NoAccessPage() {
  const { permissions } = useAuth();
  const navigate = useNavigate();

  function goHome() {
    if (hasModuleAccess(permissions, 'budgeting')) navigate('/budgeting');
    else if (hasModuleAccess(permissions, 'procurement')) navigate('/procurement');
    else navigate('/login');
  }

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 'calc(100vh - 52px)', padding: 24 }}>
      <div style={{ textAlign: 'center', maxWidth: 440 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#053066', margin: '0 0 8px' }}>Access Restricted</h1>
        <p style={{ fontSize: 14, color: '#64748b', margin: '0 0 24px' }}>
          You don't have permission to view this page. Contact your administrator if you believe this is an error.
        </p>
        <button
          type="button"
          onClick={goHome}
          style={{
            padding: '10px 24px',
            border: 'none',
            borderRadius: 8,
            background: '#053066',
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            fontFamily: 'inherit',
          }}
        >
          Go to Dashboard
        </button>
      </div>
    </div>
  );
}

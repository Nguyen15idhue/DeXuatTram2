import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import ErrorMessage from '../../components/ErrorMessage';
import { LogIn } from 'lucide-react';

const LoginPage = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(email, password);

    if (result.success) {
      navigate('/map');
    } else {
      setError(result.message);
    }
    setLoading(false);
  };

  return (
    <div className="card bg-base-100 shadow-xl w-full max-w-md">
      <div className="card-body p-6 sm:p-8">
        <h2 className="card-title text-2xl font-bold justify-center mb-2">
          Đăng nhập
        </h2>

        {error && <ErrorMessage message={error} />}

        <form onSubmit={handleSubmit}>
          <div className="form-control mb-3">
            <label className="label py-1">
              <span className="label-text font-medium">Email</span>
            </label>
            <input
              type="email"
              placeholder="email@example.com"
              className="input input-bordered w-full"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="form-control mb-4">
            <label className="label py-1">
              <span className="label-text font-medium">Mật khẩu</span>
            </label>
            <input
              type="password"
              placeholder="••••••••"
              className="input input-bordered w-full"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div className="form-control">
            <button
              type="submit"
              className={`btn btn-primary w-full gap-2 ${loading ? 'btn-disabled' : ''}`}
              disabled={loading}
            >
              <LogIn size={18} />
              {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </button>
          </div>
        </form>

        <div className="divider my-2">HOẶC</div>

        <p className="text-center text-sm text-base-content/60">
          Chưa có tài khoản?{' '}
          <Link to="/register" className="link link-primary font-medium">
            Đăng ký
          </Link>
        </p>
      </div>
    </div>
  );
};

export default LoginPage;

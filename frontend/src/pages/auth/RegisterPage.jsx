import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import ErrorMessage from '../../components/ErrorMessage';
import { UserPlus } from 'lucide-react';

const RegisterPage = () => {
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (formData.password !== formData.confirmPassword) {
      setError('Mật khẩu không khớp');
      return;
    }

    setLoading(true);
    const result = await register(formData.full_name, formData.email, formData.phone, formData.password);

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
          Đăng ký
        </h2>

        {error && <ErrorMessage message={error} />}

        <form onSubmit={handleSubmit}>
          <div className="form-control mb-3">
            <label className="label py-1">
              <span className="label-text font-medium">Họ tên</span>
            </label>
            <input
              type="text"
              name="full_name"
              placeholder="Nguyễn Văn A"
              className="input input-bordered w-full"
              value={formData.full_name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-control mb-3">
            <label className="label py-1">
              <span className="label-text font-medium">Email</span>
            </label>
            <input
              type="email"
              name="email"
              placeholder="email@example.com"
              className="input input-bordered w-full"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-control mb-3">
            <label className="label py-1">
              <span className="label-text font-medium">Số điện thoại</span>
            </label>
            <input
              type="tel"
              name="phone"
              placeholder="0912 345 678"
              className="input input-bordered w-full"
              value={formData.phone}
              onChange={handleChange}
            />
          </div>

          <div className="form-control mb-3">
            <label className="label py-1">
              <span className="label-text font-medium">Mật khẩu</span>
            </label>
            <input
              type="password"
              name="password"
              placeholder="••••••••"
              className="input input-bordered w-full"
              value={formData.password}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-control mb-4">
            <label className="label py-1">
              <span className="label-text font-medium">Xác nhận mật khẩu</span>
            </label>
            <input
              type="password"
              name="confirmPassword"
              placeholder="••••••••"
              className="input input-bordered w-full"
              value={formData.confirmPassword}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-control">
            <button
              type="submit"
              className={`btn btn-primary w-full gap-2 ${loading ? 'btn-disabled' : ''}`}
              disabled={loading}
            >
              <UserPlus size={18} />
              {loading ? 'Đang đăng ký...' : 'Đăng ký'}
            </button>
          </div>
        </form>

        <div className="divider my-2">HOẶC</div>

        <p className="text-center text-sm text-base-content/60">
          Đã có tài khoản?{' '}
          <Link to="/login" className="link link-primary font-medium">
            Đăng nhập
          </Link>
        </p>
      </div>
    </div>
  );
};

export default RegisterPage;

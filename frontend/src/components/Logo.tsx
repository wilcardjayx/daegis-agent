import React, { useState } from 'react';
import { Shield } from 'lucide-react';

interface LogoProps {
  className?: string;
  size?: number;
}

export const Logo: React.FC<LogoProps> = ({ 
  className = '', 
  size = 28
}) => {
  const [error, setError] = useState(false);

  if (error) {
    return <Shield strokeWidth={1.25} size={size} className={className} />;
  }

  return (
    <img 
      src="/logo.jpg" 
      alt="DAegis Logo"
      width={size}
      height={size}
      className={`shrink-0 object-contain mix-blend-multiply dark:mix-blend-screen transition-transform duration-200 ${className}`}
      onError={() => setError(true)}
    />
  );
};


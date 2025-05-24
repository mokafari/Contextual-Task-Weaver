
import React from 'react';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg';
  color?: string; // Tailwind color class e.g., text-blue-500
  className?: string; // Allow additional className
}

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({ size = 'md', color = 'text-sky-400', className = '' }) => {
  const sizeClasses = {
    sm: 'w-4 h-4 sm:w-5 sm:h-5', // Adjusted for responsiveness
    md: 'w-6 h-6 sm:w-8 sm:h-8',
    lg: 'w-10 h-10 sm:w-12 sm:h-12',
  };

  return (
    <svg 
      className={`animate-spin ${sizeClasses[size]} ${color} ${className}`}
      xmlns="http://www.w3.org/2000/svg" 
      fill="none" 
      viewBox="0 0 24 24"
      role="status"
      aria-label="Loading"
    >
      <circle 
        className="opacity-25" 
        cx="12" 
        cy="12" 
        r="10" 
        stroke="currentColor" 
        strokeWidth="4"
      ></circle>
      <path 
        className="opacity-75" 
        fill="currentColor" 
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      ></path>
    </svg>
  );
};

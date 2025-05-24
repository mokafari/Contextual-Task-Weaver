
import React, { useState } from 'react';
import { logger } from '../services/logger'; // Assuming logger is in services

interface ErrorMessageProps {
  message: string | null;
  className?: string;
  title?: string;
  detailsToCopy?: string | object; // Allow passing full error object or pre-formatted string
}

export const ErrorMessage: React.FC<ErrorMessageProps> = ({ message, className = '', title = "Error", detailsToCopy }) => {
  const [copied, setCopied] = useState(false);

  if (!message) {
    return null;
  }

  let userGuidance = "";
  const lowerMessage = message.toLowerCase();

  if (lowerMessage.includes("api key") || lowerMessage.includes("apikey")) {
    userGuidance = "Hint: Please verify your API_KEY configuration or environment variable.";
  } else if (lowerMessage.includes("quota") || lowerMessage.includes("rate limit") || lowerMessage.includes("resource_exhausted")) {
    userGuidance = "Hint: AI request limit reached. Please wait a few minutes or check your API plan.";
  } else if (lowerMessage.includes("media") || lowerMessage.includes("camera") || lowerMessage.includes("screen capture") || lowerMessage.includes("getusermedia") || lowerMessage.includes("getdisplaymedia")) {
    userGuidance = "Hint: Ensure browser permissions are granted for camera/screen access for this site.";
  } else if (lowerMessage.includes("network") || lowerMessage.includes("failed to fetch")) {
    userGuidance = "Hint: Check your internet connection.";
  } else if (lowerMessage.includes("json") && (lowerMessage.includes("parse") || lowerMessage.includes("output"))) {
    userGuidance = "Hint: AI returned an unexpected format. Retrying might help, or check the AI's prompt configuration if developing."
  }


  const handleCopyError = () => {
    let textToCopy = `Error Title: ${title}\nError Message: ${message}\n`;
    if (userGuidance) {
        textToCopy += `User Guidance: ${userGuidance}\n`;
    }
    if (detailsToCopy) {
      if (typeof detailsToCopy === 'string') {
        textToCopy += `\nDetails:\n${detailsToCopy}`;
      } else {
        try {
          textToCopy += `\nDetails (JSON):\n${JSON.stringify(detailsToCopy, null, 2)}`;
        } catch (e) {
          logger.warn("ErrorMessage", "handleCopyError", "Could not stringify detailsToCopy", e);
          textToCopy += `\nDetails (Object):\n${detailsToCopy.toString()}`;
        }
      }
    }
    
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(err => {
      logger.error("ErrorMessage", "handleCopyError", "Failed to copy error details", err);
      alert("Failed to copy error details. Please copy manually from console if needed.");
    });
  };

  return (
    <div 
      className={`p-3 sm:p-4 my-3 bg-red-700/80 border border-red-900/70 text-red-100 rounded-md shadow-md w-full max-w-xl mx-auto ${className}`}
      role="alert"
    >
      <div className="flex">
        <div className="py-1">
          <svg className="fill-current h-5 w-5 sm:h-6 sm:w-6 text-red-300 mr-3 flex-shrink-0" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
            <path d="M2.93 17.07A10 10 0 1 1 17.07 2.93 10 10 0 0 1 2.93 17.07zM9 5v6h2V5H9zm0 8v2h2v-2H9z"/>
          </svg>
        </div>
        <div className="flex-grow">
          <p className="font-bold text-sm sm:text-base">{title}</p>
          <p className="text-xs sm:text-sm break-words">{message}</p>
          {userGuidance && <p className="text-xs sm:text-sm mt-1 text-red-200 italic">{userGuidance}</p>}
        </div>
        <button 
            onClick={handleCopyError}
            className="ml-2 px-2 py-1 text-xs font-medium rounded bg-red-800 hover:bg-red-700 text-red-100 transition-colors self-start flex-shrink-0"
            title="Copy error details to clipboard"
        >
            {copied ? "Copied!" : "Copy Details"}
        </button>
      </div>
    </div>
  );
};

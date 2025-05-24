
import React from 'react';
import type { TaskItem, CognitiveParserOutput, UserEdit } from '../types';
import { TaskCard } from './TaskCard';

interface TaskColumnProps {
  title: string;
  tasks: TaskItem[];
  allContexts: Map<string, CognitiveParserOutput>;
  onUpdateTask: (taskId: string, updates: Partial<TaskItem>, editLog?: UserEdit) => void;
  onRateTaskAccuracy: (taskId: string, rating: 'relevant' | 'irrelevant') => void;
}

export const TaskColumn: React.FC<TaskColumnProps> = ({ title, tasks, allContexts, onUpdateTask, onRateTaskAccuracy }) => {
  return (
    <div className="bg-slate-850 p-2 sm:p-3 rounded-lg shadow-lg flex flex-col h-[calc(100vh-22rem)] min-h-[280px] sm:min-h-[300px] md:max-h-[550px] lg:max-h-[600px]">
      <h2 className="text-lg sm:text-xl font-semibold text-sky-300 mb-3 sticky top-0 bg-slate-850 py-2 z-10 border-b border-slate-700 px-1">
        {title} ({tasks.length})
      </h2>
      {tasks.length === 0 ? (
        <p className="text-slate-500 text-sm italic mt-2 text-center flex-grow flex items-center justify-center">
          No tasks in this category.
        </p>
      ) : (
        <div className="space-y-2 sm:space-y-3 overflow-y-auto custom-scrollbar flex-grow pr-1 pb-1">
          {tasks
            .sort((a, b) => b.lastUpdatedTimestamp - a.lastUpdatedTimestamp) // Show most recently updated first
            .map(task => (
            <TaskCard 
                key={task.id} 
                task={task} 
                allContexts={allContexts} 
                onUpdateTask={onUpdateTask}
                onRateTaskAccuracy={onRateTaskAccuracy}
            />
          ))}
        </div>
      )}
    </div>
  );
};

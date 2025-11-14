import { useState, useEffect } from 'react';
import { Star, Github } from 'lucide-react';

const GITHUB_REPO_URL = 'https://github.com/sravand123/jsonbro.dev';

export function GitHubStars() {
  const [stars, setStars] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchStars = async () => {
      try {
        const response = await fetch('https://api.github.com/repos/sravand123/jsonbro.dev');
        if (!response.ok) {
          throw new Error('Failed to fetch GitHub stars');
        }
        const data = await response.json();
        setStars(data.stargazers_count);
      } catch (err) {
        console.error('Error fetching GitHub stars:', err);
        setError('Failed to load star count');
      } finally {
        setIsLoading(false);
      }
    };

    fetchStars();
  }, []);

  if (error) {
    return null; // Don't show anything if there's an error
  }

  return (
    <a
      href={GITHUB_REPO_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-center gap-1.5 px-2.5 py-1.5 text-sm text-muted-foreground transition-colors rounded-md hover:bg-emerald-50/80 dark:hover:bg-emerald-900/30 group border border-transparent hover:border-emerald-200 dark:hover:border-emerald-800 shadow-sm"
      title="View on GitHub"
    >
      <Github className="h-4 w-4 group-hover:scale-110 transition-transform group-hover:text-emerald-600 dark:group-hover:text-emerald-400" />
      <div className="h-4 w-px bg-border/50 group-hover:bg-emerald-200 dark:group-hover:bg-emerald-700 transition-colors mx-0.5" />
      <div className="flex items-center gap-1">
        <Star className="h-4 w-4 fill-current group-hover:fill-emerald-500 group-hover:text-emerald-500 dark:group-hover:fill-emerald-400 dark:group-hover:text-emerald-400 transition-colors" />
        {!isLoading && stars !== null && (
          <span className="text-xs font-medium group-hover:text-emerald-700 dark:group-hover:text-emerald-300">
            {stars.toLocaleString()}
          </span>
        )}
      </div>
    </a>
  );
}

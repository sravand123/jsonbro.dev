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
      className="flex items-center gap-1.5 3xl:gap-2 4xl:gap-2.5 5xl:gap-3 px-2.5 3xl:px-3 4xl:px-3.5 5xl:px-4 py-1.5 3xl:py-2 4xl:py-2.5 5xl:py-3 text-sm 3xl:text-base 4xl:text-lg 5xl:text-xl text-muted-foreground transition-all duration-200 rounded-lg hover:bg-emerald-50/80 dark:hover:bg-emerald-900/30 group border border-border/40 hover:border-emerald-200 dark:hover:border-emerald-800 shadow-sm hover:shadow-md"
      title="Star us on GitHub"
    >
      <Github className="h-4 w-4 3xl:h-5 3xl:w-5 4xl:w-6 4xl:h-6 5xl:w-7 5xl:h-7 group-hover:scale-110 transition-transform duration-200 group-hover:text-emerald-600 dark:group-hover:text-emerald-400" />
      <div className="h-4 3xl:h-5 4xl:h-6 5xl:h-7 w-px bg-border/50 group-hover:bg-emerald-200 dark:group-hover:bg-emerald-700 transition-colors duration-200" />
      <div className="flex items-center gap-1 3xl:gap-1.5 4xl:gap-2 5xl:gap-2.5">
        <Star className="h-4 w-4 3xl:h-5 3xl:w-5 4xl:w-6 4xl:h-6 5xl:w-7 5xl:h-7 fill-current group-hover:fill-emerald-500 group-hover:text-emerald-500 dark:group-hover:fill-emerald-400 dark:group-hover:text-emerald-400 transition-all duration-200 group-hover:scale-110" />
        {!isLoading && stars !== null && (
          <span className="text-xs 3xl:text-sm 4xl:text-base 5xl:text-lg font-medium group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors duration-200">
            {stars.toLocaleString()}
          </span>
        )}
      </div>
    </a>
  );
}

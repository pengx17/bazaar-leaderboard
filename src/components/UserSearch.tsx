import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";

interface UserSearchProps {
  onSearch: (username: string) => void;
  loading?: boolean;
}

export function UserSearch({ onSearch, loading }: UserSearchProps) {
  const [username, setUsername] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = username.trim();
    if (trimmed) onSearch(trimmed);
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search player..."
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="pl-9 bg-card border-border/50 font-mono text-sm h-10 placeholder:text-muted-foreground/40 focus-visible:ring-amber-500/30 focus-visible:border-amber-500/50"
        />
      </div>
      <Button
        type="submit"
        disabled={!username.trim() || loading}
        className="h-10 px-5 bg-amber-500 text-black font-bold hover:bg-amber-400 disabled:opacity-30 transition-all"
      >
        {loading ? (
          <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
        ) : (
          "Track"
        )}
      </Button>
    </form>
  );
}

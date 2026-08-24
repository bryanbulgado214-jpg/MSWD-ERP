const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

export interface SearchItem {
  id: string;
  label: string;
  description: string;
  amount: string;
  date: string;
  status?: string;
  link: string;
}
export interface SearchGroup {
  category: string;
  items: SearchItem[];
}
export interface SearchResult {
  query: string;
  total: number;
  groups: SearchGroup[];
}

export async function globalSearch(q: string): Promise<SearchResult> {
  const token = localStorage.getItem('mswd_access_token');
  const res = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(q)}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Search failed (${res.status}).`);
  return res.json();
}

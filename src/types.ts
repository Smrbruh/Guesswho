export type Lang = 'ru' | 'en';
export type Character = { id: string; name: string; nameEn: string; img: string; traits: string[] };
export type Category = { id: string; title: string; titleEn: string; subtitle: string; subtitleEn: string; color: string; characters: Character[] };
export type Profile = { id: string; username: string; coins: number; wins: number; games: number; frame: string; owned: string[]; friend_code?:string; avatar?:string|null; rating: number; rated_games: number; category_wins: Record<string,number>; title: string };
export type Room = { id: string; code: string; category: string; host_id: string; guest_id: string | null; host_name: string; guest_name: string | null; status: 'waiting' | 'selecting' | 'playing' | 'finished'; turn_id: string | null; winner_id: string | null; is_public: boolean; created_at: string; host_ready: boolean; guest_ready: boolean; host_avatar?:string|null; host_title?:string; host_rating?:number; host_frame?:string; rating_changes?: Record<string,number> };
export type Message = { id: string; sender_id: string; username: string; body: string; created_at: string };
export type GameView = { room: Room; secret: string | null; messages: Message[]; players?:Record<string,{avatar:string|null;title:string;rating:number;frame:string}> };

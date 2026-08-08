/**
 * Static image registry.
 *
 * Imported through Vite so every file is hashed, copied into dist/ and cached
 * properly. The previous build referenced `/src/assets/...` as runtime strings,
 * which resolved in dev but produced 404s in the production bundle.
 */
import archetypeArtist from './assets/images/archetype_artist_1786218395472.jpg';
import archetypeBestFriend from './assets/images/archetype_best_friend_1786218354088.jpg';
import archetypeHeir from './assets/images/archetype_heir_1786218369884.jpg';
import archetypeLeader from './assets/images/archetype_leader_1786218383946.jpg';
import archetypeRival from './assets/images/archetype_rival_1786218407858.jpg';
import dreamArtist from './assets/images/dream_scene_artist_1786223011411.jpg';
import dreamBestFriend from './assets/images/dream_scene_best_friend_1786222977159.jpg';
import dreamHeir from './assets/images/dream_scene_heir_1786222989818.jpg';
import dreamLeader from './assets/images/dream_scene_leader_1786223000370.jpg';
import dreamRival from './assets/images/dream_scene_rival_1786223022317.jpg';
import hero from './assets/images/kdrama_romance_hero_1786217601646.jpg';
import productBundle from './assets/images/manifestation_journal_mockup_1786217631573.jpg';
import productCoaching from './assets/images/planner_bundle_mockup_1786217646235.jpg';
import productBlueprint from './assets/images/romance_reading_cover_1786217617175.jpg';

export const IMAGES: Record<string, string> = {
  hero,
  archetype_best_friend: archetypeBestFriend,
  archetype_heir: archetypeHeir,
  archetype_leader: archetypeLeader,
  archetype_artist: archetypeArtist,
  archetype_rival: archetypeRival,
  dream_best_friend: dreamBestFriend,
  dream_heir: dreamHeir,
  dream_leader: dreamLeader,
  dream_artist: dreamArtist,
  dream_rival: dreamRival,
  product_blueprint: productBlueprint,
  product_bundle: productBundle,
  product_coaching: productCoaching,
};

export function image(key: string): string {
  return IMAGES[key] ?? hero;
}

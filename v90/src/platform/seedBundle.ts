// Belgeden üretilmiş seed dosyalarının paketi.
//
// JSON'lar `npm run gen` ile üretilir ve bundle'a gömülür; uygulama ilk
// açılışta bunları kurar (src/core/db/seed.ts). Elle düzenlenmez.
import exercisesJson from '../../data/exercises.json';
import programJson from '../../data/programs/v90.json';
import targetsJson from '../../data/muscle-volume-targets.json';
import type { SeedBundle, SeedExercise, SeedProgram, SeedRelation, SeedTarget } from '../core/db/seed.ts';

// JSON literal tipleri gerçek şemadan daha dardır (ör. boş dizi -> never[]);
// doğrulama derleyicide değil, `npm run verify:seed` içindeki 12 kontrolde
// yapılır. Bu yüzden burada tek bir bilinçli çevrim var.
const ex = exercisesJson as unknown as { seedVersion: number; exercises: SeedExercise[]; relations: SeedRelation[] };

export const SEED_BUNDLE: SeedBundle = {
  seedVersion: ex.seedVersion,
  exercises: ex.exercises,
  relations: ex.relations,
  program: programJson as unknown as SeedProgram,
  targets: (targetsJson as unknown as { targets: SeedTarget[] }).targets,
};

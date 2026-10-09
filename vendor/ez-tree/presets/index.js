import ashSmall from './ash_small.preset.js';
import ashMedium from './ash_medium.preset.js';
import ashLarge from './ash_large.preset.js';
import aspenSmall from './aspen_small.preset.js';
import aspenMedium from './aspen_medium.preset.js';
import aspenLarge from './aspen_large.preset.js';
import bush1 from './bush_1.preset.js';
import bush2 from './bush_2.preset.js';
import bush3 from './bush_3.preset.js';
import oakSmall from './oak_small.preset.js';
import oakMedium from './oak_medium.preset.js';
import oakLarge from './oak_large.preset.js';
import pineSmall from './pine_small.preset.js';
import pineMedium from './pine_medium.preset.js';
import pineLarge from './pine_large.preset.js';
import trellis from './trellis.preset.js';
import TreeOptions from '../options.js';

export const TreePreset = {
  'Ash Small': ashSmall,
  'Ash Medium': ashMedium,
  'Ash Large': ashLarge,
  'Aspen Small': aspenSmall,
  'Aspen Medium': aspenMedium,
  'Aspen Large': aspenLarge,
  'Bush 1': bush1,
  'Bush 2': bush2,
  'Bush 3': bush3,
  'Oak Small': oakSmall,
  'Oak Medium': oakMedium,
  'Oak Large': oakLarge,
  'Pine Small': pineSmall,
  'Pine Medium': pineMedium,
  'Pine Large': pineLarge,
  'Trellis': trellis,
};

/**
 * @param {string} name The name of the preset to load
 * @returns {TreeOptions}
 */
export function loadPreset(name) {
  const preset = TreePreset[name];
  return preset ? structuredClone(preset) : new TreeOptions();
}

export interface InfData {
  sources: string[];
  packages: string[];
  pcds: string[];
  guids: string[]; // protocols and guids
  infPath: string;

}
export interface DecData {
  includes: string[];
  decPath: string;
}
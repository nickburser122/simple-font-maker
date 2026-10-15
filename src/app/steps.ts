export interface StepInfo {
  n: number;
  id: string;
  label: string;
  title: string;
  lede: string;
  empty: string;
}

export const steps: StepInfo[] = [
  {
    n: 1,
    id: 'print',
    label: 'Print',
    title: 'Print the sheet',
    lede: 'choose a character set and paper size, then print the template. fill each box with a dark pen.',
    empty: 'no template yet.',
  },
  {
    n: 2,
    id: 'capture',
    label: 'Capture',
    title: 'Capture the pages',
    lede: 'photograph or scan each filled sheet. add as many pages as the set needs.',
    empty: 'no pages added.',
  },
  {
    n: 3,
    id: 'refine',
    label: 'Refine',
    title: 'Refine the glyphs',
    lede: 'check every traced glyph against the preview. adjust spacing and smoothness until the text reads well.',
    empty: '0 of 0 glyphs found.',
  },
  {
    n: 4,
    id: 'export',
    label: 'Export',
    title: 'Export the font',
    lede: 'name the font and download the .otf. save the project to keep working later.',
    empty: 'nothing to export yet.',
  },
];

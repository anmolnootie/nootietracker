module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        brand: ['"Baloo 2"', 'cursive'],
      },
      colors: {
        risk: {
          black: '#1F2937',
          red: '#DC2626',
          orange: '#F97316',
          yellow: '#FBBF24',
          green: '#10B981',
        },
        // Control Tower brand (docs/control-tower/reference/style.css)
        ct: { orange: '#e8591a', yellow: '#f6a21e', cream: '#faf6f1', ink: '#2b2118' },
        nootie: {
          orange: '#EA6A2D',
          'orange-dark': '#CC5620',
          'orange-light': '#FDE9DC',
          gold: '#F7A823',
          'gold-dark': '#DB8F13',
          cream: '#FFF8EF',
        },
      },
    },
  },
  plugins: [],
};

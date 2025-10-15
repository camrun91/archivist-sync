# Contributing to Archivist Sync

Thank you for your interest in contributing to Archivist Sync!

## Development Setup

### Prerequisites

- Node.js 18.x or 20.x
- npm (comes with Node.js)

### Getting Started

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

## Code Quality

This project uses ESLint and Prettier to maintain code quality and consistency.

### Linting

Run the linter to check for issues:

```bash
npm run lint
```

Automatically fix formatting issues:

```bash
npm run lint:fix
```

### Code Style

- Use ES modules (`import`/`export`)
- 2 spaces for indentation
- Single quotes for strings
- Semicolons required
- Max line length: 100 characters

### Pre-commit Checklist

Before committing your changes:

1. ✅ Run `npm run lint:fix` to auto-format code
2. ✅ Fix any remaining linting errors/warnings
3. ✅ Test your changes in Foundry VTT

## Continuous Integration

GitHub Actions automatically runs linting checks on all pull requests and pushes to `main` and `tooling` branches. Your code must pass these checks before being merged.

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Run linting and fix any issues
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to your branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Questions?

If you have questions, please open an issue on GitHub.


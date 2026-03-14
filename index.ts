#!/usr/bin/env bun
import { createProgram } from './src/cli/commands';

const program = createProgram();

program.parse();

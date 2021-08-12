import {
  addProjectConfiguration,
  generateFiles,
  getWorkspaceLayout,
  names,
  offsetFromRoot,
  formatFiles,
  Tree,
} from '@nrwl/devkit';
import * as path from 'path';
import { AppGeneratorSchema } from './schema';
import { jestProjectGenerator } from '@nrwl/jest';
import initGenerator from '../init/init';
import { runTasksInSerial } from '@nrwl/workspace/src/utilities/run-tasks-in-serial';
import { CDKRunExecutorSchema } from '../../executors/run/schema';

interface NormalizedSchema extends AppGeneratorSchema {
  projectName: string;
  projectRoot: string;
  projectDirectory: string;
  parsedTags: string[];
  outputDirectory: string;
}

function normalizeOptions(
  host: Tree,
  options: AppGeneratorSchema
): NormalizedSchema {
  const name = names(options.name).fileName;
  const projectDirectory = options.directory
    ? `${names(options.directory).fileName}/${name}`
    : name;
  const projectName = projectDirectory.replace(new RegExp('/', 'g'), '-');
  const projectRoot = `${getWorkspaceLayout(host).appsDir}/${projectDirectory}`;
  const parsedTags = options.tags
    ? options.tags.split(',').map((s) => s.trim())
    : [];
  const outputDirectory = `dist/${projectRoot}/cdk.out`;

  return {
    ...options,
    projectName,
    projectRoot,
    projectDirectory,
    parsedTags,
    outputDirectory,
  };
}

export async function addJest(host: Tree, options: NormalizedSchema) {
  if (options.unitTestRunner !== 'jest') {
    return () => {
      /* do nothing */
    };
  }

  return await jestProjectGenerator(host, {
    project: options.projectName,
    supportTsx: true,
    skipSerializers: true,
    setupFile: 'none',
    babelJest: true,
  });
}

function addFiles(host: Tree, options: NormalizedSchema) {
  const templateOptions = {
    ...options,
    ...names(options.name),
    offsetFromRoot: offsetFromRoot(options.projectRoot),
    template: '',
  };
  generateFiles(
    host,
    path.join(__dirname, 'files'),
    options.projectRoot,
    templateOptions
  );
}

export default async function (host: Tree, schema: AppGeneratorSchema) {
  const options = normalizeOptions(host, schema);

  const initTask = await initGenerator(host, options);

  const runTarget = (opts: CDKRunExecutorSchema) => ({
    executor: '@otterdev/nx-cdk:run',
    options: opts,
  });
  addProjectConfiguration(host, options.projectName, {
    root: options.projectRoot,
    projectType: 'application',
    targets: {
      synth: {
        ...runTarget({ command: 'synth', parameters: [], options: ['-q'] }),
        outputs: [options.outputDirectory],
      },
      deploy: runTarget({ command: 'deploy', parameters: [], options: [] }),
      destroy: runTarget({ command: 'destroy', parameters: [], options: [] }),
      bootstrap: runTarget({
        command: 'bootstrap',
        parameters: [],
        options: [],
      }),
    },
    tags: options.parsedTags,
    implicitDependencies: options.project ? [options.project] : undefined,
  });
  addFiles(host, options);
  const jestTask = await addJest(host, options);

  await formatFiles(host);
  return runTasksInSerial(initTask, jestTask);
}

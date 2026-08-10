import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { ProyectoNetflixInfraStack } from '../lib/proyecto_netflix-infra-stack';

let template: Template;
let resources: Record<string, any>;

// Synthesizing bundles every NodejsFunction with esbuild, so this is slow — do it once.
beforeAll(() => {
  const app = new cdk.App();
  template = Template.fromStack(new ProyectoNetflixInfraStack(app, 'TestStack'));
  resources = template.toJSON().Resources;
}, 600_000);

/** The single Lambda that serves the Two-Tower model, identified by its artifact prefix. */
function twoTowerFunction(): [string, any] {
  const matches = template.findResources('AWS::Lambda::Function', {
    Properties: {
      Environment: { Variables: Match.objectLike({ MODEL_ARTIFACT_PREFIX: 'two-tower/v1/' }) },
    },
  });
  const ids = Object.keys(matches);
  expect(ids).toHaveLength(1);
  return [ids[0], matches[ids[0]]];
}

function resourceIdsByPath(pathPart: string): string[] {
  return Object.keys(template.findResources('AWS::ApiGateway::Resource', { Properties: { PathPart: pathPart } }));
}

describe('Two-Tower recommendations', () => {
  test('the Lambda is sized for the cold-start artifact load', () => {
    const [, fn] = twoTowerFunction();

    expect(fn.Properties.Runtime).toBe('nodejs18.x');
    // Downloading ~7 MB of vectors and scanning MoviesTable has to fit in the timeout, and
    // memory is what buys CPU for the dot product.
    expect(fn.Properties.MemorySize).toBe(1024);
    expect(fn.Properties.Timeout).toBe(15);
    expect(fn.Properties.Environment.Variables.MODEL_VERSION).toBe('v1');
    // It still gets the shared table/bucket wiring.
    expect(fn.Properties.Environment.Variables.BUCKET_MODEL_ARTIFACTS).toBeDefined();
    expect(fn.Properties.Environment.Variables.TABLE_WATCH_HISTORY).toBeDefined();
  });

  test('is exposed at .../recommendations/ml behind the Cognito authorizer', () => {
    const [fnId] = twoTowerFunction();

    const mlIds = resourceIdsByPath('ml');
    expect(mlIds).toHaveLength(1);

    // It hangs off the existing recommendations resource, not off the API root.
    const recommendationsIds = resourceIdsByPath('recommendations');
    expect(recommendationsIds).toHaveLength(1);
    expect(resources[mlIds[0]].Properties.ParentId.Ref).toBe(recommendationsIds[0]);

    const methods = template.findResources('AWS::ApiGateway::Method', {
      Properties: { ResourceId: { Ref: mlIds[0] }, HttpMethod: 'GET' },
    });
    expect(Object.keys(methods)).toHaveLength(1);

    const method = methods[Object.keys(methods)[0]].Properties;
    expect(method.AuthorizationType).toBe('COGNITO_USER_POOLS');
    expect(JSON.stringify(method.Integration.Uri)).toContain(fnId);
  });

  test('can read the model artifacts and scan the catalog', () => {
    const [, fn] = twoTowerFunction();
    const roleId = fn.Properties.Role['Fn::GetAtt'][0];

    const policies = Object.values(template.findResources('AWS::IAM::Policy')).filter((policy: any) =>
      JSON.stringify(policy.Properties.Roles).includes(roleId)
    );
    expect(policies).toHaveLength(1);

    const statements = JSON.stringify((policies[0] as any).Properties.PolicyDocument);
    expect(statements).toContain('s3:GetObject');
    expect(statements).toContain('dynamodb:Scan'); // the model -> catalog id bridge
    expect(statements).toContain('dynamodb:Query'); // watch history on recent-index
    expect(statements).toContain('dynamodb:BatchGetItem'); // hydrating the results
    // Read-only: it must never be able to write to the catalog.
    expect(statements).not.toContain('dynamodb:PutItem');
  });

  test('leaves the heuristic endpoint wired to its own Lambda', () => {
    const [fnId] = twoTowerFunction();

    const methods = template.findResources('AWS::ApiGateway::Method', {
      Properties: { ResourceId: { Ref: resourceIdsByPath('recommendations')[0] }, HttpMethod: 'GET' },
    });
    expect(Object.keys(methods)).toHaveLength(1);

    const method = methods[Object.keys(methods)[0]].Properties;
    expect(JSON.stringify(method.Integration.Uri)).not.toContain(fnId);
  });
});

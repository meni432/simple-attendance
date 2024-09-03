import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
// import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as dynamo from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53Targets from 'aws-cdk-lib/aws-route53-targets';
import {
  ResourceServer,
  Client,
  ClientGrant,
  Trigger,
  Action,
} from "@flit/cdk-auth0";

export class AttendanceCdkStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // create custom domain for api gateway with acm certificate arn
    const domainName = 'attendance.silkify.cloud';
    const baseUrl = `https://${domainName}`;
    const certificateArn = 'arn:aws:acm:us-east-1:748860791422:certificate/a601e44d-eeb9-45e4-9cae-ca00f9887247';
    const certificate = acm.Certificate.fromCertificateArn(this, 'Certificate', certificateArn);

    // lookup hosted zone
    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: 'silkify.cloud',
    });

    // create a secret for jwt secret
    const secret = new secretsmanager.Secret(this, 'attendance-global-secret', {
      secretName: 'attendance-global-secret-jwt-secret',
      generateSecretString: {
        secretStringTemplate: JSON.stringify({  }),
        generateStringKey: 'jwtSecret',
        excludePunctuation: true,
        includeSpace: false,
        passwordLength: 64
      }
    });

    // create dynamo db table
    const table = new dynamo.Table(this, 'attendance-table', {
      partitionKey: { name: 'classId', type: dynamo.AttributeType.STRING },
      sortKey: { name: 'email', type: dynamo.AttributeType.STRING },
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      readCapacity: 1, 
      writeCapacity: 1,
      timeToLiveAttribute: 'validityTimestamp',
    });


    // deploy lambda function add dynamo table name to env variable
    const backendLambda = new lambda.Function(this, 'attendanceBackend', {
      runtime: lambda.Runtime.NODEJS_20_X,
      handler: 'index.handler',
      code: lambda.Code.fromAsset('../lambdas/express-backend'),
      environment: {
        TABLE_NAME: table.tableName,
        JWT_SECRET_NAME: secret.secretName,
        BASE_URL: baseUrl,
      },
    });

    // grant the lambda function read permissions to the secret
    secret.grantRead(backendLambda);
    // grant the lambda function read/write permissions to the table
    table.grantReadWriteData(backendLambda);

    // create api gateway for attendance
    const api = new cdk.aws_apigateway.LambdaRestApi(this,
      'attendance-api',
      {
        handler: backendLambda,
        proxy: true,
        domainName: {
          domainName: domainName,
          certificate: certificate,
        },
        endpointTypes: [apigateway.EndpointType.REGIONAL]
      }
    );

    // create a record set for the custom domain
    new route53.ARecord(this, 'ApiDomainAliasRecord', {
      recordName: domainName,
      target: route53.RecordTarget.fromAlias(new route53Targets.ApiGateway(api)),
      zone: hostedZone,
    });

    // output the api endpoint
    new cdk.CfnOutput(this, 'API Gateway URL', {
      value: api.url ?? 'Something went wrong with the deploy',
    });

    // output the table name
    new cdk.CfnOutput(this, 'Table Name', {
      value: table.tableName,
    });

    // output the secret name
    new cdk.CfnOutput(this, 'Secret Name', {
      value: secret.secretName,
    });

    // output the custom domain name
    new cdk.CfnOutput(this, 'Custom Domain', {
      value: domainName,
    });

    // output the base url
    new cdk.CfnOutput(this, 'Base URL', {
      value: baseUrl,
    });

    const auth0Secret = new secretsmanager.Secret(this,
      'auth-secret',
      {
        secretName: 'auth0-m2m-for-cdk',
      }
    );

    // const resourceServer = new ResourceServer(this, "ResourceServer", {
    //   apiSecret: auth0Secret,
    //   name: "web-api",
    //   identifier: "web-api",
    //   tokenLifetime: cdk.Duration.minutes(2),
    //   enforcePolicies: true,
    //   allowOfflineAccess: true,
    // });

    // const webClient = new Client(this, "WebClient", {
    //   apiSecret: auth0Secret,
    //   name: "web-client",
    //   appType: "regular_web",
    //   isFirstParty: true,
    //   tokenEndpointAuthMethod: "client_secret_basic",
    //   initiateLoginUri: "https://test.com/auth",
    //   callbacks: ["https://test.com/auth/callback"],
    //   allowedLogoutUrls: ["https://test.com"],
    //   oidcConformant: true,
    //   refreshToken: {
    //     rotationType: "rotating",
    //     expirationType: "expiring",
    //     tokenLifetime: cdk.Duration.days(7),
    //     idleTokenLifetime: cdk.Duration.days(1),
    //   },
    //   grantTypes: ["implicit", "authorization_code", "refresh_token"],
    // });

    // new ClientGrant(this, "ClientGrant", {
    //   apiSecret: auth0Secret,
    //   client: webClient,
    //   audience: resourceServer,
    //   scope: [],
    // });
  }
}

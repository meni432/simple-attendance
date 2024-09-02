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

export class AttendanceCdkStack extends cdk.Stack {

  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // create custom domain for api gateway with acm certificate arn
    const domainName = 'attendance.silkify.cloud';
    const baseUrl = `https://${domainName}`;
    const certificateArn = 'arn:aws:acm:us-east-1:748860791422:certificate/d49004fb-7f63-4f44-a26b-264246e46a53';
    const certificate = acm.Certificate.fromCertificateArn(this, 'Certificate', certificateArn);

    // lookup hosted zone
    const hostedZone = route53.HostedZone.fromLookup(this, 'HostedZone', {
      domainName: 'silkify.space',
    });

    // create a secret for jwt secret
    const secret = new secretsmanager.Secret(this, 'attendance-global-secret', {
      secretName: 'jwt-secret',
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
      runtime: lambda.Runtime.NODEJS_LATEST,
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
  }
}

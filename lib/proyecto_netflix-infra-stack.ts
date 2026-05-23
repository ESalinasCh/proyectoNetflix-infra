import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';

export class ProyectoNetflixInfraStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // ─────────────────────────────────────────────────────────────────────────────
    // 1. DYNAMODB TABLES DEFINITIONS
    // ─────────────────────────────────────────────────────────────────────────────

    // Table: movies
    const moviesTable = new dynamodb.Table(this, 'MoviesTable', {
      partitionKey: { name: 'movieId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    moviesTable.addGlobalSecondaryIndex({
      indexName: 'genre-index',
      partitionKey: { name: 'genreId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    moviesTable.addGlobalSecondaryIndex({
      indexName: 'director-index',
      partitionKey: { name: 'director', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    moviesTable.addGlobalSecondaryIndex({
      indexName: 'year-index',
      partitionKey: { name: 'releaseYear', type: dynamodb.AttributeType.NUMBER },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Table: video_assets
    const videoAssetsTable = new dynamodb.Table(this, 'VideoAssetsTable', {
      partitionKey: { name: 'movieId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'quality', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Table: genres
    const genresTable = new dynamodb.Table(this, 'GenresTable', {
      partitionKey: { name: 'genreId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Table: user_lists
    const userListsTable = new dynamodb.Table(this, 'UserListsTable', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'movieId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // Table: watch_history
    const watchHistoryTable = new dynamodb.Table(this, 'WatchHistoryTable', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'movieId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    watchHistoryTable.addGlobalSecondaryIndex({
      indexName: 'recent-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'lastWatchedAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Table: stream_sessions
    const streamSessionsTable = new dynamodb.Table(this, 'StreamSessionsTable', {
      partitionKey: { name: 'sessionId', type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: 'expiresAt',
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    streamSessionsTable.addGlobalSecondaryIndex({
      indexName: 'user-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // S3 Buckets for video ingestion and streaming
    const rawVideosBucket = new s3.Bucket(this, 'RawVideosBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
    });

    const transcodedVideosBucket = new s3.Bucket(this, 'TranscodedVideosBucket', {
      removalPolicy: cdk.RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      publicReadAccess: true,
      blockPublicAccess: new s3.BlockPublicAccess({
        blockPublicAcls: false,
        blockPublicPolicy: false,
        ignorePublicAcls: false,
        restrictPublicBuckets: false,
      }),
    });

    // Shared environment variables mapping table names
    const sharedEnv = {
      TABLE_MOVIES: moviesTable.tableName,
      TABLE_VIDEO_ASSETS: videoAssetsTable.tableName,
      TABLE_GENRES: genresTable.tableName,
      TABLE_USER_LISTS: userListsTable.tableName,
      TABLE_WATCH_HISTORY: watchHistoryTable.tableName,
      TABLE_STREAM_SESSIONS: streamSessionsTable.tableName,
      BUCKET_RAW_VIDEOS: rawVideosBucket.bucketName,
      BUCKET_TRANSCODED_VIDEOS: transcodedVideosBucket.bucketName,
    };

    // ─────────────────────────────────────────────────────────────────────────────
    // 2. LAMBDA FUNCTIONS DEFINITIONS (17 handlers)
    // ─────────────────────────────────────────────────────────────────────────────

    // Helper function to declare Lambda handlers pointing to the App workspace
    const createLambda = (id: string, serviceName: string, fileName: string) => {
      const fn = new NodejsFunction(this, id, {
        entry: path.join(__dirname, `../../proyectoNetflix/src/${serviceName}/${fileName}.ts`),
        projectRoot: path.join(__dirname, '../../proyectoNetflix'),
        depsLockFilePath: path.join(__dirname, '../../proyectoNetflix/package-lock.json'),
        runtime: lambda.Runtime.NODEJS_18_X,
        handler: 'handler',
        environment: sharedEnv,
        bundling: {
          minify: true,
          sourceMap: true,
          externalModules: ['@aws-sdk/*'], // Bundled dynamically via esbuild
        },
      });
      return fn;
    };

    // Genres microservice
    const listGenresFn = createLambda('ListGenresFn', 'genres', 'listGenres');
    const getGenreFn = createLambda('GetGenreFn', 'genres', 'getGenre');
    const listMoviesByGenreFn = createLambda('ListMoviesByGenreFn', 'genres', 'listMoviesByGenre');

    // Catalog microservice
    const listMoviesFn = createLambda('ListMoviesFn', 'catalog', 'listMovies');
    const getMovieFn = createLambda('GetMovieFn', 'catalog', 'getMovie');
    const createMovieFn = createLambda('CreateMovieFn', 'catalog', 'createMovie');
    const updateMovieFn = createLambda('UpdateMovieFn', 'catalog', 'updateMovie');
    const deleteMovieFn = createLambda('DeleteMovieFn', 'catalog', 'deleteMovie');

    // Streaming microservice
    const createStreamSessionFn = createLambda('CreateStreamSessionFn', 'streaming', 'createStreamSession');
    const getStreamSessionFn = createLambda('GetStreamSessionFn', 'streaming', 'getStreamSession');
    const endStreamSessionFn = createLambda('EndStreamSessionFn', 'streaming', 'endStreamSession');
    const triggerTranscodeFn = createLambda('TriggerTranscodeFn', 'streaming', 'triggerTranscode');
    const transcodeCallbackFn = createLambda('TranscodeCallbackFn', 'streaming', 'transcodeCallback');

    // User microservice
    const getUserListFn = createLambda('GetUserListFn', 'user', 'getUserList');
    const addToUserListFn = createLambda('AddToUserListFn', 'user', 'addToUserList');
    const removeFromUserListFn = createLambda('RemoveFromUserListFn', 'user', 'removeFromUserList');
    const getWatchHistoryFn = createLambda('GetWatchHistoryFn', 'user', 'getWatchHistory');
    const updateWatchProgressFn = createLambda('UpdateWatchProgressFn', 'user', 'updateWatchProgress');
    const deleteWatchHistoryFn = createLambda('DeleteWatchHistoryFn', 'user', 'deleteWatchHistory');

    // ─────────────────────────────────────────────────────────────────────────────
    // 3. IAM PERMISSIONS GRANTING
    // ─────────────────────────────────────────────────────────────────────────────

    // Genres
    genresTable.grantReadData(listGenresFn);
    genresTable.grantReadData(getGenreFn);
    moviesTable.grantReadData(listMoviesByGenreFn); // Queries genre-index GSI on movies table

    // Catalog
    moviesTable.grantReadData(listMoviesFn);
    moviesTable.grantReadData(getMovieFn);
    moviesTable.grantWriteData(createMovieFn);
    moviesTable.grantReadWriteData(updateMovieFn);
    moviesTable.grantWriteData(deleteMovieFn);

    // Streaming
    moviesTable.grantReadData(createStreamSessionFn);
    streamSessionsTable.grantWriteData(createStreamSessionFn);
    streamSessionsTable.grantReadData(getStreamSessionFn);
    streamSessionsTable.grantReadWriteData(endStreamSessionFn);

    // User lists
    userListsTable.grantReadData(getUserListFn);
    moviesTable.grantReadData(addToUserListFn);
    userListsTable.grantWriteData(addToUserListFn);
    userListsTable.grantReadWriteData(removeFromUserListFn);

    // Watch history
    watchHistoryTable.grantReadData(getWatchHistoryFn);
    moviesTable.grantReadData(updateWatchProgressFn);
    watchHistoryTable.grantWriteData(updateWatchProgressFn);
    watchHistoryTable.grantReadWriteData(deleteWatchHistoryFn);

    // VOD Ingestion Pipeline Permissions and Triggers
    rawVideosBucket.grantReadWrite(triggerTranscodeFn);
    transcodedVideosBucket.grantReadWrite(triggerTranscodeFn);
    transcodedVideosBucket.grantReadWrite(transcodeCallbackFn);

    moviesTable.grantReadWriteData(triggerTranscodeFn);
    moviesTable.grantReadWriteData(transcodeCallbackFn);
    videoAssetsTable.grantReadWriteData(triggerTranscodeFn);
    videoAssetsTable.grantReadWriteData(transcodeCallbackFn);

    // S3 ObjectCreated Event notification to Lambda
    rawVideosBucket.addEventNotification(
      s3.EventType.OBJECT_CREATED,
      new s3n.LambdaDestination(triggerTranscodeFn),
      { suffix: '.mp4' }
    );

    // EventBridge Rule for Elemental MediaConvert status callbacks
    const mediaConvertRule = new events.Rule(this, 'MediaConvertRule', {
      eventPattern: {
        source: ['aws.mediaconvert'],
        detailType: ['MediaConvert Job State Change'],
        detail: {
          status: ['COMPLETE', 'ERROR']
        }
      }
    });
    mediaConvertRule.addTarget(new targets.LambdaFunction(transcodeCallbackFn));

    // ─────────────────────────────────────────────────────────────────────────────
    // 4. API GATEWAY ROUTING DEFINITIONS
    // ─────────────────────────────────────────────────────────────────────────────

    const api = new apigateway.RestApi(this, 'NetflixCloneApi', {
      restApiName: 'Netflix Clone Service API',
      description: 'REST API for Netflix Clone project (catalog, user lists, watch history, and HLS streaming sessions).',
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: ['Content-Type', 'Authorization'],
      },
    });

    const v1 = api.root.addResource('v1');

    // Resources: /v1/movies
    const movies = v1.addResource('movies');
    movies.addMethod('GET', new apigateway.LambdaIntegration(listMoviesFn));
    movies.addMethod('POST', new apigateway.LambdaIntegration(createMovieFn));

    const movie = movies.addResource('{movieId}');
    movie.addMethod('GET', new apigateway.LambdaIntegration(getMovieFn));
    movie.addMethod('PUT', new apigateway.LambdaIntegration(updateMovieFn));
    movie.addMethod('DELETE', new apigateway.LambdaIntegration(deleteMovieFn));

    // Resources: /v1/genres
    const genres = v1.addResource('genres');
    genres.addMethod('GET', new apigateway.LambdaIntegration(listGenresFn));

    const genre = genres.addResource('{genreId}');
    genre.addMethod('GET', new apigateway.LambdaIntegration(getGenreFn));

    const genreMovies = genre.addResource('movies');
    genreMovies.addMethod('GET', new apigateway.LambdaIntegration(listMoviesByGenreFn));

    // Resources: /v1/streaming/sessions
    const streaming = v1.addResource('streaming');
    const sessions = streaming.addResource('sessions');
    sessions.addMethod('POST', new apigateway.LambdaIntegration(createStreamSessionFn));

    const session = sessions.addResource('{sessionId}');
    session.addMethod('GET', new apigateway.LambdaIntegration(getStreamSessionFn));
    session.addMethod('DELETE', new apigateway.LambdaIntegration(endStreamSessionFn));

    // Resources: /v1/users/{userId}
    const users = v1.addResource('users');
    const userResource = users.addResource('{userId}');

    const userLists = userResource.addResource('lists');
    userLists.addMethod('GET', new apigateway.LambdaIntegration(getUserListFn));
    userLists.addMethod('POST', new apigateway.LambdaIntegration(addToUserListFn));

    const userListMovie = userLists.addResource('{movieId}');
    userListMovie.addMethod('DELETE', new apigateway.LambdaIntegration(removeFromUserListFn));

    const userHistory = userResource.addResource('history');
    userHistory.addMethod('GET', new apigateway.LambdaIntegration(getWatchHistoryFn));

    const userHistoryMovie = userHistory.addResource('{movieId}');
    userHistoryMovie.addMethod('PUT', new apigateway.LambdaIntegration(updateWatchProgressFn));
    userHistoryMovie.addMethod('DELETE', new apigateway.LambdaIntegration(deleteWatchHistoryFn));
  }
}

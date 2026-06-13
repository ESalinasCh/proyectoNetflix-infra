import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambdaEventSources from 'aws-cdk-lib/aws-lambda-event-sources';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as s3n from 'aws-cdk-lib/aws-s3-notifications';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as opensearch from 'aws-cdk-lib/aws-opensearchservice';
import * as fs from 'fs';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as secretsmanager from 'aws-cdk-lib/aws-secretsmanager';

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
      stream: dynamodb.StreamViewType.NEW_AND_OLD_IMAGES,
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

    // Table: reviews (P2)
    const reviewsTable = new dynamodb.Table(this, 'ReviewsTable', {
      partitionKey: { name: 'movieId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'reviewId', type: dynamodb.AttributeType.STRING },
      billingMode: dynamodb.BillingMode.PAY_PER_REQUEST,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    reviewsTable.addGlobalSecondaryIndex({
      indexName: 'user-index',
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'createdAt', type: dynamodb.AttributeType.STRING },
      projectionType: dynamodb.ProjectionType.ALL,
    });

    // Table: profiles (P2)
    const profilesTable = new dynamodb.Table(this, 'ProfilesTable', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'profileId', type: dynamodb.AttributeType.STRING },
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
      cors: [
        {
          allowedMethods: [s3.HttpMethods.GET],
          allowedOrigins: ['*'],
          allowedHeaders: ['*'],
        },
      ],
    });

    // Amazon OpenSearch Service Domain for text search
    const searchDomain = new opensearch.Domain(this, 'SearchDomainV2', {
      version: opensearch.EngineVersion.OPENSEARCH_2_11,
      capacity: {
        dataNodeInstanceType: 't3.medium.search',
        dataNodes: 1,
        multiAzWithStandbyEnabled: false,
      },
      ebs: {
        volumeSize: 10,
      },
      encryptionAtRest: {
        enabled: true,
      },
      nodeToNodeEncryption: true,
      accessPolicies: [
        new iam.PolicyStatement({
          actions: ['es:*'],
          effect: iam.Effect.ALLOW,
          principals: [new iam.AccountRootPrincipal()],
          resources: ['*'],
        }),
      ],
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    // CloudFront Public Key configuration
    let publicKeyString = 'MOCK_PUBLIC_KEY';
    try {
      publicKeyString = fs.readFileSync(path.join(__dirname, '../../public_key.pem'), 'utf8');
    } catch (e) {
      console.warn('public_key.pem not found, using placeholder');
    }

    const publicKey = new cloudfront.PublicKey(this, 'CloudFrontPublicKey', {
      encodedKey: publicKeyString,
      publicKeyName: 'netflix-clone-public-key',
    });

    const keyGroup = new cloudfront.KeyGroup(this, 'CloudFrontKeyGroup', {
      items: [publicKey],
      keyGroupName: 'netflix-clone-key-group',
    });

    // CloudFront Distribution for streaming transcoded videos
    const distribution = new cloudfront.Distribution(this, 'StreamingDistribution', {
      defaultBehavior: {
        origin: new origins.S3Origin(transcodedVideosBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        trustedKeyGroups: [keyGroup],
      },
    });

    // Secrets Manager Secret for storing private key (for Lambda CloudFront signer)
    let privateKeyString = 'MOCK_PRIVATE_KEY';
    try {
      privateKeyString = fs.readFileSync(path.join(__dirname, '../../private_key.pem'), 'utf8');
    } catch (e) {
      console.warn('private_key.pem not found, using placeholder');
    }

    const privateKeySecret = new secretsmanager.Secret(this, 'CloudFrontPrivateKeySecret', {
      secretName: 'NetflixCloneCloudFrontPrivateKey',
      secretStringValue: cdk.SecretValue.unsafePlainText(privateKeyString),
    });

    // Shared environment variables mapping table names
    const sharedEnv = {
      TABLE_MOVIES: moviesTable.tableName,
      TABLE_VIDEO_ASSETS: videoAssetsTable.tableName,
      TABLE_GENRES: genresTable.tableName,
      TABLE_USER_LISTS: userListsTable.tableName,
      TABLE_WATCH_HISTORY: watchHistoryTable.tableName,
      TABLE_STREAM_SESSIONS: streamSessionsTable.tableName,
      TABLE_REVIEWS: reviewsTable.tableName,
      TABLE_PROFILES: profilesTable.tableName,
      BUCKET_RAW_VIDEOS: rawVideosBucket.bucketName,
      BUCKET_TRANSCODED_VIDEOS: transcodedVideosBucket.bucketName,
      OPENSEARCH_ENDPOINT: searchDomain.domainEndpoint,
      CLOUDFRONT_DOMAIN: distribution.distributionDomainName,
      CLOUDFRONT_KEY_PAIR_ID: publicKey.publicKeyId,
      CLOUDFRONT_PRIVATE_KEY_SECRET_ARN: privateKeySecret.secretArn,
    };

    // ─────────────────────────────────────────────────────────────────────────────
    // 2. LAMBDA FUNCTIONS DEFINITIONS (17 handlers)
    // ─────────────────────────────────────────────────────────────────────────────

    // Helper function to declare Lambda handlers pointing to the app-code submodule
    const createLambda = (id: string, serviceName: string, fileName: string) => {
      const fn = new NodejsFunction(this, id, {
        entry: path.join(__dirname, `../app-code/src/${serviceName}/${fileName}.ts`),
        projectRoot: path.join(__dirname, '../app-code'),
        depsLockFilePath: path.join(__dirname, '../app-code/package-lock.json'),
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

    // OpenSearch sync (P2 - Tarea 2.1)
    const syncToOpenSearchFn = createLambda('SyncToOpenSearchFn', 'catalog', 'syncToOpenSearch');

    // Reviews microservice (P2 - Tarea 2.2)
    const createReviewFn = createLambda('CreateReviewFn', 'catalog', 'createReview');
    const listReviewsByMovieFn = createLambda('ListReviewsByMovieFn', 'catalog', 'listReviewsByMovie');
    const deleteReviewFn = createLambda('DeleteReviewFn', 'catalog', 'deleteReview');

    // Profiles microservice (P2 - Tarea 2.3)
    const listProfilesFn = createLambda('ListProfilesFn', 'user', 'listProfiles');
    const createProfileFn = createLambda('CreateProfileFn', 'user', 'createProfile');
    const deleteProfileFn = createLambda('DeleteProfileFn', 'user', 'deleteProfile');

    // Recommendations (P2 - Tarea 2.4)
    const getRecommendationsFn = createLambda('GetRecommendationsFn', 'user', 'getRecommendations');

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
    moviesTable.grantReadWriteData(deleteMovieFn);
    searchDomain.grantReadWrite(listMoviesFn);

    // Streaming
    moviesTable.grantReadData(createStreamSessionFn);
    videoAssetsTable.grantReadData(createStreamSessionFn);
    streamSessionsTable.grantWriteData(createStreamSessionFn);
    streamSessionsTable.grantReadData(getStreamSessionFn);
    streamSessionsTable.grantReadWriteData(endStreamSessionFn);
    privateKeySecret.grantRead(createStreamSessionFn);

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

    // OpenSearch sync (P2)
    searchDomain.grantReadWrite(syncToOpenSearchFn);
    syncToOpenSearchFn.addEventSource(
      new lambdaEventSources.DynamoEventSource(moviesTable, {
        startingPosition: lambda.StartingPosition.TRIM_HORIZON,
        batchSize: 10,
        retryAttempts: 3,
      })
    );

    // Reviews (P2)
    reviewsTable.grantWriteData(createReviewFn);
    moviesTable.grantReadWriteData(createReviewFn);
    reviewsTable.grantReadData(listReviewsByMovieFn);
    reviewsTable.grantReadWriteData(deleteReviewFn);
    moviesTable.grantReadWriteData(deleteReviewFn);

    // Profiles (P2)
    profilesTable.grantReadData(listProfilesFn);
    profilesTable.grantReadWriteData(createProfileFn);
    profilesTable.grantReadWriteData(deleteProfileFn);

    // Recommendations (P2)
    watchHistoryTable.grantReadData(getRecommendationsFn);
    moviesTable.grantReadData(getRecommendationsFn);
    profilesTable.grantReadData(getRecommendationsFn);

    // VOD Ingestion Pipeline Permissions and Triggers
    rawVideosBucket.grantReadWrite(triggerTranscodeFn);
    transcodedVideosBucket.grantReadWrite(triggerTranscodeFn);
    transcodedVideosBucket.grantReadWrite(transcodeCallbackFn);

    moviesTable.grantReadWriteData(triggerTranscodeFn);
    moviesTable.grantReadWriteData(transcodeCallbackFn);
    videoAssetsTable.grantReadWriteData(triggerTranscodeFn);
    videoAssetsTable.grantReadWriteData(transcodeCallbackFn);

    // MediaConvert IAM Role
    const mediaConvertRole = new iam.Role(this, 'MediaConvertRole', {
      assumedBy: new iam.ServicePrincipal('mediaconvert.amazonaws.com'),
      description: 'IAM role for MediaConvert to access S3 buckets for video transcoding',
    });

    rawVideosBucket.grantRead(mediaConvertRole);
    transcodedVideosBucket.grantReadWrite(mediaConvertRole);

    // PassRole permission for triggerTranscodeFn to delegate the transcode role
    mediaConvertRole.grantPassRole(triggerTranscodeFn.grantPrincipal);

    // MediaConvert API permissions for triggerTranscodeFn
    triggerTranscodeFn.addToRolePolicy(new iam.PolicyStatement({
      actions: ['mediaconvert:*'],
      resources: ['*'],
    }));

    // Expose MediaConvert Role ARN to triggerTranscodeFn environment
    triggerTranscodeFn.addEnvironment('MEDIACONVERT_ROLE_ARN', mediaConvertRole.roleArn);

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

    // Resources: /v1/movies/{movieId}/reviews (P2)
    const movieReviews = movie.addResource('reviews');
    movieReviews.addMethod('POST', new apigateway.LambdaIntegration(createReviewFn));
    movieReviews.addMethod('GET', new apigateway.LambdaIntegration(listReviewsByMovieFn));

    const movieReview = movieReviews.addResource('{reviewId}');
    movieReview.addMethod('DELETE', new apigateway.LambdaIntegration(deleteReviewFn));

    // Resources: /v1/users/{userId}/profiles (P2)
    const userProfiles = userResource.addResource('profiles');
    userProfiles.addMethod('GET', new apigateway.LambdaIntegration(listProfilesFn));
    userProfiles.addMethod('POST', new apigateway.LambdaIntegration(createProfileFn));

    const userProfile = userProfiles.addResource('{profileId}');
    userProfile.addMethod('DELETE', new apigateway.LambdaIntegration(deleteProfileFn));

    // Resources: /v1/users/{userId}/profiles/{profileId}/recommendations (P2)
    const profileRecommendations = userProfile.addResource('recommendations');
    profileRecommendations.addMethod('GET', new apigateway.LambdaIntegration(getRecommendationsFn));
  }
}

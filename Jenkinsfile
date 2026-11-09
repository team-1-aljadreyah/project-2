
pipeline {
    agent any

    options {
        timestamps()
        skipDefaultCheckout(true)
    }

    tools {
        nodejs 'NodeJS-24'
    }

    environment {
        CI = 'true'
    }

    stages {

        stage('Checkout') {
            steps {
                echo 'Downloading source code...'
                checkout scm
            }
        }

        stage('Node Version') {
            steps {
                sh 'node --version'
                sh 'npm --version'
            }
        }

        stage('Install Dependencies') {
            steps {
                echo 'Installing dependencies...'
                sh 'npm ci'
            }
        }

        stage('Lint') {
            steps {
                echo 'Checking code quality...'
                sh 'npm run lint'
            }
        }

        stage('Build') {
            steps {
                echo 'Building Next.js application...'
                sh 'npm run build'
            }
        }
    }

    post {
        success {
            echo 'CI PIPELINE SUCCESSFUL!'
        }

        failure {
            echo 'CI PIPELINE FAILED!'
        }

        always {
            echo 'Pipeline execution completed.'
        }
    }
}
